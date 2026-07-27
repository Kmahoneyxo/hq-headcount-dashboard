-- SBS whitespace by country × segment (unassigned accounts on JAM)
-- 'None' or null team = SBS / unassigned pool
-- Country from PCID hq_country (fallback billing_country), rolled to market codes
-- Japan excluded. Current 90d: 20260427–20260725

WITH country_market AS (
  SELECT
    p.company_size_segment AS segment,
    CASE
      WHEN COALESCE(p.hq_country, p.billing_country, 'XX') IN ('DE', 'AT', 'CH') THEN 'DACH'
      WHEN COALESCE(p.hq_country, p.billing_country, 'XX') IN ('BE', 'NL', 'LU') THEN 'BNL'
      WHEN COALESCE(p.hq_country, p.billing_country, 'XX') = 'GB' THEN 'UK'
      ELSE COALESCE(p.hq_country, p.billing_country, 'XX')
    END AS country,
    j.current_parent_company_id AS parent_company_id,
    SUM(j.cpc_revenue_millicents + j.cpa_revenue_millicents) / 100000.0 AS revenue_90d
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  JOIN datalake.scss.client_attributes_dim_parent_attributes_current p
    ON j.current_parent_company_id = p.parent_company_id
  WHERE j.dl__yyyymmdd_cst BETWEEN '20260427' AND '20260725'
    AND (j.current_sales_team_name IS NULL OR j.current_sales_team_name = 'None')
  GROUP BY 1, 2, 3
)

SELECT
  segment,
  country,
  COUNT(DISTINCT parent_company_id) AS sbs_unassigned_accounts,
  ROUND(SUM(revenue_90d), 0) AS sbs_revenue_90d
FROM country_market
WHERE country <> 'JP'
GROUP BY 1, 2
HAVING COUNT(DISTINCT parent_company_id) >= 10
ORDER BY sbs_revenue_90d DESC;
