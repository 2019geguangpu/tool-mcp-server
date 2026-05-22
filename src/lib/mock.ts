export function mockDdl(tableName: string): string {
  return `CREATE TABLE \`${tableName}\` (
  \`id\` bigint NOT NULL AUTO_INCREMENT,
  \`name\` varchar(64) NOT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
}

export const MOCK_EXPLAIN_JSON = JSON.stringify(
  {
    query_block: {
      select_id: 1,
      cost_info: { query_cost: "1.00" },
      table: {
        table_name: "users",
        access_type: "const",
        rows_examined_per_scan: 1,
        filtered: "100.00",
      },
    },
  },
  null,
  2
);
