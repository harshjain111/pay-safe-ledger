/**
 * Centralized TanStack Query keys.
 *
 * Every useQuery / invalidateQueries call must source its key from here so keys
 * never drift between the place that reads data and the place that invalidates it.
 *
 * Convention: `.all` is the broad prefix used for invalidation (partial match
 * invalidates every more-specific entry under it); the factory functions build
 * the specific keys that individual queries subscribe to.
 */
export const queryKeys = {
  dashboardStats: {
    all: ['dashboard-stats'] as const,
    byRole: (isOwner: boolean) => ['dashboard-stats', isOwner] as const,
  },
  staffBalance: {
    all: ['staff-balance'] as const,
    byStaff: (staffId: string | null | undefined) => ['staff-balance', staffId] as const,
  },
  ledger: {
    all: ['ledger'] as const,
    byStaff: (staffId: string | null | undefined) => ['ledger', staffId] as const,
  },
  advancesOutstanding: {
    all: ['advances-outstanding'] as const,
  },
} as const;
