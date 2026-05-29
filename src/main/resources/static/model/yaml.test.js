import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import parse from './parse.js';
import yamlModel from './yaml.js';

const raw = yaml.load(readFileSync(join(process.cwd(), 'src/main/resources/services.yml'), 'utf8'));
const model = parse.normalize(raw);

describe('yaml export', () => {
  it('round-trips: normalize(load(dump(model))) deep-equals model', () => {
    const text = yamlModel.dump(model, yaml);
    const reparsed = parse.normalize(yaml.load(text));
    expect(reparsed).toEqual(model);
  });

  it('omits empty fields and writes via only when present', () => {
    const obj = yamlModel.toExportObject(model);
    const gw = obj.services.find((s) => s.id === 'api-gateway');
    expect(gw).not.toHaveProperty('loadBalancerPool');
    expect(gw).not.toHaveProperty('dependsOn'); // api-gateway has none

    const web = obj.services.find((s) => s.id === 'web-fe-01');
    expect(web.dependsOn[0]).toHaveProperty('via'); // routed dep keeps via

    const direct = obj.services
      .flatMap((s) => s.dependsOn || [])
      .find((d) => d.via === undefined);
    if (direct) expect(direct).not.toHaveProperty('via'); // direct dep omits via
  });
});
