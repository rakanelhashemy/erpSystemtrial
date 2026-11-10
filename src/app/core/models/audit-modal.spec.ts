import { describe, expect, it } from 'vitest';
import { normalizeAuditResponse } from './audit-modal';

describe('normalizeAuditResponse', () => {
  it('normalizes the API envelope and paged item list', () => {
    const result = normalizeAuditResponse({
      succeeded: true,
      data: {
        isReadOnly: true,
        counts: { total: 8, pending: 2, checked: 5, missing: 1 },
        items: {
          data: [{ itemId: 'item-1', itemName: 'Laptop', status: 'Checked' }],
          totalPages: 4,
          totalCount: 8,
        },
      },
    });

    expect(result).toEqual({
      isReadOnly: true,
      counts: { total: 8, pending: 2, checked: 5, missing: 1 },
      items: [
        {
          id: 'item-1',
          code: '',
          serialNumber: '',
          itemName: 'Laptop',
          groupName: '',
          locationName: '',
          status: 'Checked',
        },
      ],
      totalPages: 4,
      totalCount: 8,
    });
  });

  it('supports the standard paged response shape', () => {
    const result = normalizeAuditResponse({
      succeeded: true,
      data: { data: [], currentPage: 1, totalPages: 0, totalCount: 0 },
    });

    expect(result?.items).toEqual([]);
    expect(result?.totalPages).toBe(1);
    expect(result?.totalCount).toBe(0);
  });

  it('rejects failed or malformed responses instead of rendering them as an empty audit', () => {
    expect(normalizeAuditResponse({ succeeded: false, data: [] })).toBeNull();
    expect(normalizeAuditResponse({ succeeded: true, data: { data: 'invalid' } })).toBeNull();
    expect(normalizeAuditResponse(null)).toBeNull();
  });

  it('sanitizes invalid count values and filters rows without stable identifiers', () => {
    const result = normalizeAuditResponse({
      data: {
        counts: { total: -4, pending: Number.NaN, checked: '3', missing: null },
        data: [{ id: 'item-1', itemName: 'Laptop' }, { itemName: 'Invalid row' }],
      },
    });

    expect(result?.counts).toEqual({ total: 1, pending: 0, checked: 3, missing: 0 });
    expect(result?.items).toHaveLength(1);
  });
});
