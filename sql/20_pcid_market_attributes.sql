-- PCID market attributes — raw export from data lake
-- All columns from client_attributes_dim_parent_attributes_current
-- Scoped to PCIDs on HQ rep books (same rep universe as sql/18; excludes JP)
-- Run on Quest prod; output → docs/data/pcid_market_attributes.csv
-- Quest export_csv caps at 5k rows/page — run 3 partitions and combine:
--   AND MOD(p.parent_company_id, 3) = <part>   (part 0, 1, 2)

WITH hq_reps AS (
  SELECT DISTINCT j.current_sales_rep_id AS sales_rep_id
  FROM datalake.imhotep_iceberg.jobactivitymetrics j
  LEFT JOIN (
    SELECT sales_rep_id, MAX(sales_market) AS market
    FROM datalake.sales_data_strategy_dsa.current_parent_rep_assignment
    GROUP BY 1
  ) m ON j.current_sales_rep_id = m.sales_rep_id
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
)

SELECT
  p.activity_date,
  p.parent_company_id,
  p.parent_company_name,
  p.created_date,
  p.ultimate_parent_id,
  p.ultimate_parent_name,
  p.billing_country,
  p.hq_city,
  p.hq_state,
  p.hq_country,
  p.company_zip,
  p.advertiser_count,
  p.advertiser_bid_optimizer_enabled_count,
  p.prospect_count,
  p.login_count,
  p.agency_id,
  p.agency_name,
  p.agency_location,
  p.company_size_segment,
  p.company_size_segment_methodology,
  p.industry,
  p.industry_group,
  p.industry_sector,
  p.type,
  p.is_featured_employer,
  p.is_company_page_verified,
  p.is_ad_agency,
  p.is_staffing_agency,
  p.is_enterprise,
  p.domestic_owner_owned_locations_employee_count,
  p.sales_rep_id,
  p.service_rep_id,
  p.strategic_rep_id,
  p.agency_rep_id,
  p.dkpid,
  CAST(p.etl_updated_timestamp AS VARCHAR) AS etl_updated_timestamp,
  p.sales_business_unit_segment
FROM datalake.scss.client_attributes_dim_parent_attributes_current p
WHERE p.sales_rep_id IN (SELECT sales_rep_id FROM hq_reps)
  AND MOD(p.parent_company_id, 3) = 0  -- change to 0, 1, or 2 for each export partition
ORDER BY p.billing_country, p.company_size_segment, p.parent_company_id
