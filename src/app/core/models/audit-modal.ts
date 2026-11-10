// Hard-coded on purpose: the backend has no endpoint for these statuses.
export type AuditItemStatus = 'Pending' | 'Checked' | 'Missing';
export type AuditResult = AuditItemStatus; // PUT body field is "result", not "status"

export interface AuditItem {
  id: string;
  code: string;
  serialNumber: string;
  itemName: string;
  groupName: string;
  locationName: string;
  status: AuditItemStatus | string;
}

export interface AuditCounts {
  total: number;
  pending: number;
  checked: number;
  missing: number;
}

export interface AuditItemsQuery {
  pageNumber: number;
  pageSize: number;
  search: string;
  status?: AuditItemStatus | null;
  id?: string;
  code?: string;
  brandId?: number | null;
  modelId?: number | null;
  materialId?: number | null;
  countryId?: number | null;
  departmentId?: string | null;
  capacity?: string;
}

/** Normalised shape used by the component (see normalizeAuditResponse). */
export interface AuditItemsPage {
  isReadOnly: boolean;
  counts: AuditCounts;
  items: AuditItem[];
  totalPages: number;
  totalCount: number;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

/** Accepts the API envelope and its paged payload without trusting runtime data. */
export function normalizeAuditResponse(res: unknown): AuditItemsPage | null {
  const envelope = asRecord(res);
  if (envelope?.['succeeded'] === false) return null;

  const payload = asRecord(envelope?.['data']) ?? envelope;
  if (!payload) return null;

  const itemsPage = asRecord(payload['items']);
  const candidateItems = itemsPage?.['data'] ?? payload['items'] ?? payload['data'];
  if (!Array.isArray(candidateItems)) return null;

  const items = candidateItems.flatMap((item): AuditItem[] => {
    const row = asRecord(item);
    if (!row || typeof row['itemName'] !== 'string') return [];
    const id = typeof row['itemId'] === 'string' ? row['itemId'] : row['id'];
    if (typeof id !== 'string' || !id) return [];

    return [
      {
        id,
        code: typeof row['code'] === 'string' ? row['code'] : '',
        serialNumber: typeof row['serialNumber'] === 'string' ? row['serialNumber'] : '',
        itemName: row['itemName'],
        groupName: typeof row['groupName'] === 'string' ? row['groupName'] : '',
        locationName: typeof row['locationName'] === 'string' ? row['locationName'] : '',
        status: typeof row['status'] === 'string' ? row['status'] : 'Pending',
      },
    ];
  });
  const paging = itemsPage ?? payload;
  const rawCounts = asRecord(payload['counts']);
  const totalCount = asCount(paging['totalCount'] ?? items.length);
  const counts: AuditCounts = {
    total: asCount(rawCounts?.['total']) || totalCount,
    pending: asCount(rawCounts?.['pending']),
    checked: asCount(rawCounts?.['checked']),
    missing: asCount(rawCounts?.['missing']),
  };

  return {
    isReadOnly: payload['isReadOnly'] === true,
    counts,
    items,
    totalPages: Math.max(1, asCount(paging['totalPages'])),
    totalCount,
  };
}
