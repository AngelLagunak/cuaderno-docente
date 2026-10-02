import type { CLink, CNode, Subject } from './model';

export interface Issue {
  key: string;
  nodeId: string;
  message: string;
}

/** Panel de revisión: nodos sin enlaces que deberían tenerlos. */
export function review(subject: Subject, nodes: CNode[], links: CLink[]): Issue[] {
  const issues: Issue[] = [];
  const plural = (k: string) => subject.levels.find((l) => l.key === k)?.plural.toLowerCase() ?? k;
  for (const r of subject.relations) {
    const live = links.filter((l) => l.relation === r.key && !l.deleted);
    if (r.needFrom) {
      const used = new Set(live.map((l) => l.fromId));
      for (const n of nodes.filter((x) => x.level === r.from && !x.deleted && !used.has(x.id)))
        issues.push({ key: `${r.key}:f:${n.id}`, nodeId: n.id, message: `Sin ${plural(r.to)} vinculados` });
    }
    if (r.needTo) {
      const used = new Set(live.map((l) => l.toId));
      for (const n of nodes.filter((x) => x.level === r.to && !x.deleted && !used.has(x.id)))
        issues.push({ key: `${r.key}:t:${n.id}`, nodeId: n.id, message: `Sin ${plural(r.from)} vinculados` });
    }
  }
  return issues;
}
