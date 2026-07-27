WITH rep_meta AS (
  SELECT sales_rep_id, MAX(sales_market) AS market
  FROM datalake.sales_data_strategy_dsa.current_parent_rep_assignment
  GROUP BY 1
),

rep_coverage AS (
  SELECT sales_rep_id, SUM(impact_calls) AS impact_calls_90d
  FROM datalake.sales_data_strategy_dsa.rep_activity_sales
  WHERE SUBSTR(CAST(date AS VARCHAR), 1, 10) BETWEEN '2026-04-27' AND '2026-07-25'
  GROUP BY 1
),

rep_level AS (
  SELECT
    CASE
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-([A-Za-z]+)-', 3) = 'ACCDE' THEN 'ACC'
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2) = 'MUpper' THEN 'UMM'
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2)
        IN ('M', 'L', 'NAM', 'DCA', 'ISDCA', 'NAMDCA')
        THEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2)
    END AS segment,
    CASE
      WHEN COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1))
        IN ('DE', 'AT', 'CH') THEN 'DACH'
      WHEN COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1))
        IN ('BE', 'NL', 'LU') THEN 'BNL'
      WHEN COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1)) = 'GB' THEN 'UK'
      ELSE COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1))
    END AS country,
    j.current_sales_rep_id AS sales_rep_id,
    COUNT(DISTINCT j.current_parent_company_id) AS accounts_per_rep,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_current,
    SUM(CASE WHEN j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260426'
      THEN j.cpc_revenue_millicents + j.cpa_revenue_millicents ELSE 0 END) / 100000.0 AS revenue_prior,
    MAX(cov.impact_calls_90d) AS impact_calls_90d
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  LEFT JOIN rep_meta m ON j.current_sales_rep_id = m.sales_rep_id
  LEFT JOIN rep_coverage cov ON j.current_sales_rep_id = cov.sales_rep_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260128' AND '20260725'
    AND j.current_sales_team_name IS NOT NULL AND j.current_sales_team_name <> 'None'
    AND j.current_sales_rep_id IS NOT NULL
    AND COALESCE(m.market, REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-', 1), 'XX') <> 'JP'
    AND CASE
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-([A-Za-z]+)-', 3) = 'ACCDE' THEN 'ACC'
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2) = 'MUpper' THEN 'UMM'
      WHEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2)
        IN ('M', 'L', 'NAM', 'DCA', 'ISDCA', 'NAMDCA')
        THEN REGEXP_EXTRACT(j.current_sales_team_name, '^([A-Z]{2})-([A-Za-z]+)-', 2)
    END IS NOT NULL
  GROUP BY 1, 2, 3
),

rep_base AS (
  SELECT
    segment, country, sales_rep_id,
    accounts_per_rep AS pcid_count,
    revenue_prior AS pqr_90d,
    revenue_current AS revenue_90d,
    impact_calls_90d / NULLIF(accounts_per_rep, 0) AS impact_calls_per_account
  FROM rep_level
  WHERE revenue_prior >= 5000
),

segment_benchmarks AS (
  SELECT segment, country,
    AVG(pcid_count) AS segment_avg_pcid,
    AVG(pqr_90d) AS segment_avg_pqr,
    AVG(impact_calls_per_account) AS segment_avg_coverage
  FROM rep_base
  GROUP BY 1, 2
),

-- Ideal PCID from growth peak (same logic as sql/16, abbreviated)
rep_growth AS (
  SELECT
    segment, country, sales_rep_id, accounts_per_rep,
    LEAST(GREATEST((revenue_current - revenue_prior) / NULLIF(revenue_prior, 0), -0.5), 1.0) AS revenue_growth_pct,
    CASE
      WHEN accounts_per_rep <= 10 THEN 1 WHEN accounts_per_rep <= 20 THEN 2 WHEN accounts_per_rep <= 30 THEN 3
      WHEN accounts_per_rep <= 40 THEN 4 WHEN accounts_per_rep <= 50 THEN 5 WHEN accounts_per_rep <= 65 THEN 6
      WHEN accounts_per_rep <= 80 THEN 7 WHEN accounts_per_rep <= 100 THEN 8 WHEN accounts_per_rep <= 125 THEN 9
      WHEN accounts_per_rep <= 150 THEN 10 ELSE 11
    END AS bucket_order,
    CASE
      WHEN accounts_per_rep <= 10 THEN 5 WHEN accounts_per_rep <= 20 THEN 15 WHEN accounts_per_rep <= 30 THEN 25
      WHEN accounts_per_rep <= 40 THEN 35 WHEN accounts_per_rep <= 50 THEN 45 WHEN accounts_per_rep <= 65 THEN 58
      WHEN accounts_per_rep <= 80 THEN 73 WHEN accounts_per_rep <= 100 THEN 90 WHEN accounts_per_rep <= 125 THEN 113
      WHEN accounts_per_rep <= 150 THEN 138 ELSE 175
    END AS bucket_midpoint
  FROM rep_level
  WHERE revenue_prior >= 5000
),

bucket_growth AS (
  SELECT segment, country, bucket_order, bucket_midpoint,
    COUNT(DISTINCT sales_rep_id) AS rep_count,
    ROUND(APPROX_PERCENTILE(revenue_growth_pct, 0.5), 3) AS median_growth_pct
  FROM rep_growth
  GROUP BY 1, 2, 3, 4
  HAVING COUNT(DISTINCT sales_rep_id) >= 5
),

peak AS (
  SELECT segment, country, MAX(median_growth_pct) AS peak_growth_pct
  FROM bucket_growth WHERE bucket_order <= 10 AND rep_count >= 20 GROUP BY 1, 2
),

with_next AS (
  SELECT b.*, p.peak_growth_pct,
    LEAD(b.median_growth_pct) OVER (PARTITION BY b.segment, b.country ORDER BY b.bucket_order) AS next_bucket_growth,
    LEAD(b.bucket_order) OVER (PARTITION BY b.segment, b.country ORDER BY b.bucket_order) AS next_bucket_order
  FROM bucket_growth b
  JOIN peak p ON b.segment = p.segment AND b.country = p.country
),

perfect_book AS (
  SELECT segment, country, bucket_midpoint AS ideal_pcid
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY segment, country ORDER BY bucket_order DESC) AS rn
    FROM with_next
    WHERE median_growth_pct >= peak_growth_pct * 0.85
      AND (next_bucket_growth IS NULL OR next_bucket_growth <= median_growth_pct OR next_bucket_order IS NULL)
      AND median_growth_pct > 0 AND bucket_order <= 10 AND rep_count >= 20
  ) WHERE rn = 1
),

flagged AS (
  SELECT
    rb.segment, rb.country, rb.sales_rep_id,
    rb.pcid_count, rb.pqr_90d, rb.revenue_90d, rb.impact_calls_per_account,
    pb.ideal_pcid,
    ROUND(sb.segment_avg_pcid, 1) AS segment_avg_pcid,
    ROUND(sb.segment_avg_pqr, 0) AS segment_avg_pqr,
    rb.pcid_count - pb.ideal_pcid AS vs_ideal_pcid,
    (
      (rb.pcid_count > sb.segment_avg_pcid OR rb.pqr_90d > sb.segment_avg_pqr)
      AND (rb.impact_calls_per_account < sb.segment_avg_coverage * 0.90 OR rb.revenue_90d < rb.pqr_90d)
    ) AS too_big,
    (rb.pcid_count < pb.ideal_pcid) AS too_little,
    CASE
      WHEN (rb.pcid_count > sb.segment_avg_pcid OR rb.pqr_90d > sb.segment_avg_pqr)
        AND (rb.impact_calls_per_account < sb.segment_avg_coverage * 0.90 OR rb.revenue_90d < rb.pqr_90d)
      THEN GREATEST(0, rb.pcid_count - pb.ideal_pcid)
      ELSE 0
    END AS peel_to_ideal,
    GREATEST(0, pb.ideal_pcid - rb.pcid_count) AS grow_slots
  FROM rep_base rb
  JOIN segment_benchmarks sb ON rb.segment = sb.segment AND rb.country = sb.country
  JOIN perfect_book pb ON rb.segment = pb.segment AND rb.country = pb.country
)

SELECT *
FROM flagged
WHERE too_big OR too_little
ORDER BY country, segment, peel_to_ideal DESC, grow_slots DESC