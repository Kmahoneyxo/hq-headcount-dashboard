-- Week 1 Step 2: Coverage / activity field probe
-- Goal: find fields with non-zero totals on a recent partition
-- If all zero here, try native Imhotep index or alternate activity tables

SELECT
  SUM(applies) AS applies,
  SUM(apply_starts) AS apply_starts,
  SUM(connections) AS connections,
  SUM(clicks) AS clicks,
  SUM(hires) AS hires,
  COUNT(*) AS job_day_rows,
  COUNT(DISTINCT current_parent_company_id) AS distinct_pcids
FROM datalake.imhotep_iceberg.jobactivitymetrics
WHERE dl__yyyymmdd_cst = '20260725';

-- Per-team sanity check (assigned books only)
SELECT
  current_sales_team_name AS team,
  SUM(connections) AS connections,
  SUM(clicks) AS clicks,
  SUM(applies) AS applies,
  COUNT(DISTINCT current_parent_company_id) AS accounts
FROM datalake.imhotep_iceberg.jobactivitymetrics
WHERE dl__yyyymmdd_cst = '20260725'
  AND current_sales_team_name IS NOT NULL
  AND current_sales_team_name <> 'None'
GROUP BY 1
ORDER BY connections DESC
LIMIT 20;

-- PCID-side activity proxy (account-level logins)
SELECT
  company_size_segment AS segment,
  SUM(login_count) AS total_logins,
  COUNT(*) AS parent_companies,
  SUM(CASE WHEN sales_rep_id IS NULL THEN 1 ELSE 0 END) AS unassigned_pcids
FROM datalake.scss.client_attributes_dim_parent_attributes_current
GROUP BY 1
ORDER BY 1;
