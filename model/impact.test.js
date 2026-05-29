import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import parse from './parse.js';
import impact from './impact.js';

// The default graph the app ships with, also used as the test fixture.
const raw = yaml.load(readFileSync(join(process.cwd(), 'services.yml'), 'utf8'));
const model = parse.normalize(raw);

describe('parse', () => {
  it('loads a non-empty graph', () => {
    expect(model.services.length).toBeGreaterThan(0);
  });

  it('keeps the gateway kind from YAML', () => {
    const gw = model.services.find((s) => s.id === 'api-gateway');
    expect(gw?.kind).toBe('gateway');
  });
});

describe('impact.analyzeService', () => {
  it('routes web frontend deps via the api gateway', () => {
    const d = impact.analyzeService(model, 'web-fe-01');
    expect(d.direct).toEqual([]);
    const tuples = d.via.map((v) => [v.target, v.via]);
    expect(tuples).toEqual(
      expect.arrayContaining([
        ['product-catalog-01', 'api-gateway'],
        ['search-01', 'api-gateway'],
        ['cart-svc', 'api-gateway'],
        ['checkout-svc', 'api-gateway'],
      ]),
    );
  });

  it('inventory down impacts catalog and orders, not the reverse', () => {
    const inv = impact.analyzeService(model, 'inventory-svc');
    expect(inv.impactedDirect).toEqual(
      expect.arrayContaining([
        'product-catalog-01', 'product-catalog-02', 'product-catalog-03',
        'cart-svc', 'checkout-svc',
      ]),
    );
    expect(inv.impactedTransitive).toEqual(
      expect.arrayContaining(['web-fe-01', 'search-01', 'recommendations-01']),
    );

    const pc = impact.analyzeService(model, 'product-catalog-01');
    expect(pc.impactedDirect).not.toContain('inventory-svc');
    expect(pc.impactedTransitive).not.toContain('inventory-svc');
  });

  it('feature flags impact comms transitively', () => {
    const ff = impact.analyzeService(model, 'feature-flags');
    expect(ff.impactedDirect).toEqual(expect.arrayContaining(['email-svc', 'sms-svc']));
    expect(ff.impactedTransitive).toEqual(expect.arrayContaining(['notification-svc']));
  });

  it('returns an empty result for an unknown service', () => {
    const d = impact.analyzeService(model, 'does-not-exist');
    expect(d).toEqual({
      serviceId: 'does-not-exist',
      direct: [], via: [], transitive: [], impactedDirect: [], impactedTransitive: [],
    });
  });
});
