/**
 * Chart models — every chart describes scopeRows (filters before any area selection) over the same membership as
 * the map (the row's own production district) and the same measure (offices, or personnel recorded). Ranking and top-N
 * trimming happen only after every district has been summarised.
 */
import {rankAreas, typesIn} from './profile-model.js';
import {rowValue, staffUnknown, DEFAULT_METRIC} from './model.js';

export function buildChartModel(rows, index, groups, {limit = 20, metric = DEFAULT_METRIC} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const ranking = rankAreas(list, index, {metric}).filter(a => a.value > 0);
  const unplaced = list.filter(r => !r.area);
  return {metric, areas: ranking.slice(0, limit), totalAreas: ranking.length, values: ranking.map(a => a.value), groups, totalRows: list.length,
    rowsGroups: [...new Set(list.map(r => r.group))],
    placedRows: list.length - unplaced.length, unplacedValue: unplaced.reduce((s, r) => s + rowValue(r, metric), 0)};
}

/**
 * District × group matrix of the measure (equal cells; zero is a measured 0 in this selection). Only the groups the
 * selection holds are columns — under personnel, the government-office groups only (it does not apply to places).
 */
export function areaMatrix(model, {areaLimit = 12} = {}) {
  const areas = model.areas.slice(0, areaLimit);
  const present = new Set(model.rowsGroups || []);
  const groups = model.groups.filter(g => present.has(g.index) && (model.metric !== 'staff' || g.office));
  const cells = areas.flatMap(a => {
    const values = new Map(), counts = new Map(), unknown = new Map();
    for (const r of a.rows) {
      values.set(r.group, (values.get(r.group) || 0) + rowValue(r, model.metric));
      counts.set(r.group, (counts.get(r.group) || 0) + 1);
      if (staffUnknown(r)) unknown.set(r.group, (unknown.get(r.group) || 0) + 1);
    }
    // Personnel: a cell whose offices all have unknown personnel is unknown, never a measured 0.
    return groups.map(g => ({areaId: a.id, areaName: a.name, groupId: g.id, group: g.index, groupName: g.th, value: values.get(g.index) || 0,
      count: counts.get(g.index) || 0, unknown: model.metric === 'staff' && (counts.get(g.index) || 0) > 0 && !(values.get(g.index) || 0), total: a.value}));
  });
  return {areas, groups, cells, max: Math.max(0, ...cells.map(c => c.value))};
}

/** Types of the selection ranked by the measure; every type counted, the list cut after ranking. */
export function typeRanking(rows, {limit = 20, metric = DEFAULT_METRIC} = {}) {
  const all = typesIn(Array.isArray(rows) ? rows : [], Infinity, metric);
  return {types: all.slice(0, limit), total: all.length};
}
