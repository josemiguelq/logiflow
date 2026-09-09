export interface DateRange { from: string; to: string }

export type Shortcut = 'today' | 'yesterday' | '7d' | 'thisMonth' | 'custom'

export interface KpiTotals {
  orders:           number
  delivered:        number
  onRoute:          number
  cancelled:        number
  activeCustomers:  number
  activeDeliverers: number
}

export interface SparklinePoint { date: string; count: number }

export interface KpisResponse {
  current:   KpiTotals
  compare:   KpiTotals | null
  sparkline: Record<keyof KpiTotals, SparklinePoint[]>
}

export interface TimePoint { date: string; count: number }
export interface TimeseriesResponse { current: TimePoint[]; compare: TimePoint[] | null }

export interface HalfHourPoint { slot: string; count: number }
export interface HalfHourResponse { current: HalfHourPoint[]; compare: HalfHourPoint[] | null }

export interface StatusCounts {
  PREPARING:         number
  ASSIGNED:          number
  ON_ROUTE:          number
  OUT_FOR_DELIVERY:  number
  DELIVERED:         number
  CANCELLED:         number
}

export interface CancellationReasons {
  MISSING_ITEM: number
  WRONG_ORDER:  number
  OTHER:        number
  LEGACY:       number
}
export interface CancellationsResponse { current: CancellationReasons; compare: CancellationReasons | null }

export interface DelivererSummary {
  available: number
  onRoute:   number
  offline:   number
  total:     number
}

export interface OrderAverages {
  avgOrdersPerDeliverer: number
  avgOrdersPerRoute:     number
}

export interface OrderDurations {
  avgPrepMin:  number
  avgRouteMin: number
  avgTotalMin: number
  count:       number
}

export interface DurationBucketDay {
  date:        string
  prepLt30:    number
  prep30to45:  number
  prepGt45:    number
  routeLt30:   number
  route30to45: number
  routeGt45:   number
}

export interface DelivererPerformance {
  id:            string
  name:          string
  delivered:     number
  cancelled:     number
  totalAssigned: number
  avgRouteMin:   number
}

export type DelivererSortKey = 'delivered' | 'cancelled' | 'avgRouteMin' | 'successRate'

export interface CustomerCount {
  id:            string
  name:          string
  count:         number
  previousCount: number | null
}
export interface CustomerOrderCountsSummary { top: CustomerCount[]; bottom: CustomerCount[] }
export interface CustomerOrderCountsAll { all: CustomerCount[] }

export interface ThemeData {
  theme: { primary: string; secondary: string; accent: string; logoUrl?: string | null; storeName?: string | null }
}
