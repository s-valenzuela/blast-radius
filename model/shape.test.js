import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import parse from './parse.js';
import shape from './shape.js';

const raw = yaml.load(readFileSync(join(process.cwd(), 'services.yml'), 'utf8'));
const model = parse.normalize(raw);

describe('shape.graph', () => {
  const { nodes, edges } = shape.graph(model);

  it('emits one prefixed node per service', () => {
    expect(nodes.length).toBe(model.services.length);
    expect(nodes.every((n) => n.id.startsWith('svc:'))).toBe(true);
  });

  it('splits a routed dep into a depends + routes edge pair', () => {
    const depends = edges.find(
      (e) => e.from === 'svc:web-fe-01' && e.to === 'svc:api-gateway' && e.viaTarget === 'product-catalog-01',
    );
    expect(depends).toBeTruthy();
    const routes = edges.find(
      (e) => e.type === 'routes' && e.from === 'svc:api-gateway' && e.to === 'svc:product-catalog-01' && e.route === depends.route,
    );
    expect(routes).toBeTruthy();
  });

  it('emits a plain depends edge for a direct dep', () => {
    const e = edges.find((x) => x.from === 'svc:billing-svc' && x.to === 'svc:notification-svc');
    expect(e).toMatchObject({ type: 'depends' });
    expect(e.route).toBeUndefined();
  });
});

describe('shape.serviceDetail', () => {
  it('matches the analyzer for web-fe-01', () => {
    const d = shape.serviceDetail(model, 'web-fe-01');
    expect(d.direct).toEqual([]);
    expect(d.via.map((v) => v.target)).toContain('product-catalog-01');
    expect(d.transitive.length).toBeGreaterThan(0);
  });
});

describe('shape.matrix', () => {
  const { services, deps } = shape.matrix(model);

  it('sorts services by group then name', () => {
    for (let i = 1; i < services.length; i++) {
      const prev = services[i - 1];
      const cur = services[i];
      expect(prev.group <= cur.group).toBe(true);
      if (prev.group === cur.group) expect(prev.name <= cur.name).toBe(true);
    }
  });

  it('includes dependency edges', () => {
    expect(deps.length).toBeGreaterThan(0);
    expect(deps.some((d) => d.from === 'billing-svc' && d.to === 'notification-svc')).toBe(true);
  });
});
