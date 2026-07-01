import {
  getAllowedSqlIdentifiers,
  getTableReferences,
  normalizeCompact
} from "./metadataCatalog.js";

const FORBIDDEN_SQL_PATTERN =
  /\b(insert|update|delete|drop|alter|create|truncate|copy|grant|revoke|vacuum|analyze|call|do|execute|merge|replace|set|reset|listen|notify|security|attach|detach)\b|\b(pg_sleep|dblink|lo_import|lo_export|pg_read|pg_ls|pg_stat_file|pg_file|current_setting)\b/i;
const FORBIDDEN_SCHEMAS_PATTERN = /\b(information_schema|pg_catalog)\b/i;
const TABLE_REF_PATTERN =
  /\b(?:from|join)\s+((?:"[^"]+"\s*\.\s*"[^"]+")|(?:[a-z_][a-z0-9_]*\s*\.\s*[a-z_][a-z0-9_]*)|(?:"[^"]+")|(?:[a-z_][a-z0-9_]*))/gi;
const TABLE_ALIAS_PATTERN =
  /\b(?:from|join)\s+(?:"[^"]+"\s*\.\s*"[^"]+"|[a-z_][a-z0-9_]*\s*\.\s*[a-z_][a-z0-9_]*|"[^"]+"|[a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi;
const SQL_ALLOWED_TOKENS = new Set([
  "select",
  "from",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "full",
  "cross",
  "on",
  "where",
  "and",
  "or",
  "as",
  "by",
  "group",
  "order",
  "limit",
  "offset",
  "having",
  "distinct",
  "case",
  "when",
  "then",
  "else",
  "end",
  "is",
  "not",
  "null",
  "true",
  "false",
  "ilike",
  "like",
  "in",
  "between",
  "exists",
  "asc",
  "desc",
  "nulls",
  "first",
  "last",
  "over",
  "partition",
  "count",
  "avg",
  "sum",
  "min",
  "max",
  "coalesce",
  "nullif",
  "json",
  "jsonb",
  "jsonb_build_object",
  "text",
  "integer",
  "bigint",
  "double",
  "precision",
  "geometry",
  "geography",
  "st_asgeojson",
  "st_dwithin",
  "st_intersects",
  "st_contains",
  "st_within",
  "st_buffer"
]);

function stripStringLiterals(sql) {
  return String(sql || "").replace(/'(?:''|[^'])*'/g, "''");
}

function normalizeSelectSql(sql) {
  const trimmed = String(sql || "").trim();

  if (!trimmed) {
    throw new Error("SQL bos olamaz.");
  }

  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, "").trim();

  if (withoutTrailingSemicolon.includes(";")) {
    throw new Error("SQL tek sorgu olmali; semicolon chaining engellendi.");
  }

  if (/--|\/\*|\*\//.test(withoutTrailingSemicolon)) {
    throw new Error("SQL yorum/comment iceremez.");
  }

  if (!/^select\b/i.test(withoutTrailingSemicolon)) {
    throw new Error("Sadece SELECT sorgulari desteklenir.");
  }

  if (/\b(?:from|join)\s*\(/i.test(withoutTrailingSemicolon)) {
    throw new Error("Alt sorgulu FROM/JOIN yapisi desteklenmiyor.");
  }

  if (
    FORBIDDEN_SQL_PATTERN.test(withoutTrailingSemicolon) ||
    FORBIDDEN_SCHEMAS_PATTERN.test(withoutTrailingSemicolon)
  ) {
    throw new Error("SQL guvenlik dogrulamasindan gecemedi.");
  }

  return withoutTrailingSemicolon.replace(/\s+/g, " ");
}

function extractSqlTableReferences(sql) {
  const refs = [];
  let match;

  while ((match = TABLE_REF_PATTERN.exec(sql))) {
    refs.push(normalizeCompact(match[1]));
  }

  return refs;
}

function isQuotedAlias(sql, index) {
  const prefix = sql.slice(Math.max(0, index - 12), index).toLowerCase();
  return /\bas\s+$/.test(prefix);
}

function validateQuotedIdentifiers(sql, catalog) {
  const allowed = getAllowedSqlIdentifiers(catalog);
  const noStrings = stripStringLiterals(sql);
  const quotedRegex = /"([^"]+)"/g;
  let match;

  while ((match = quotedRegex.exec(noStrings))) {
    if (isQuotedAlias(noStrings, match.index)) {
      continue;
    }

    const identifier = normalizeCompact(match[1]);
    if (!allowed.has(identifier)) {
      throw new Error(`SQL izinli olmayan kolon/identifier kullandi: ${match[1]}`);
    }
  }
}

function canonicalizeQuotedIdentifiers(sql, catalog) {
  const schemaAndTableNames = new Set();
  const columnLookup = new Map();

  for (const table of catalog.tables) {
    schemaAndTableNames.add(normalizeCompact(table.schema));
    schemaAndTableNames.add(normalizeCompact(table.table));

    for (const column of table.columns || []) {
      for (const candidate of [column.fieldName, column.alias, column.columnName]) {
        const normalized = normalizeCompact(candidate);
        if (normalized && column.columnName) {
          columnLookup.set(normalized, column.columnName);
        }
      }
    }
  }

  const source = String(sql || "");
  return source.replace(/'(?:''|[^'])*'|"([^"]+)"/g, (match, identifier, offset) => {
    if (identifier === undefined) {
      // Matched a string literal, not a quoted identifier - leave its contents untouched.
      return match;
    }

    if (isQuotedAlias(source, offset)) {
      return match;
    }

    const normalized = normalizeCompact(identifier);
    if (schemaAndTableNames.has(normalized)) {
      return match;
    }

    const physicalColumnName = columnLookup.get(normalized);
    return physicalColumnName
      ? `"${String(physicalColumnName).replaceAll('"', '""')}"`
      : match;
  });
}

function extractTableAliases(sql) {
  const aliases = new Set();
  let match;

  while ((match = TABLE_ALIAS_PATTERN.exec(sql))) {
    const alias = normalizeCompact(match[1]);
    if (alias && !SQL_ALLOWED_TOKENS.has(alias)) {
      aliases.add(alias);
    }
  }

  return aliases;
}

function validateUnquotedIdentifiers(sql, catalog) {
  const allowed = getAllowedSqlIdentifiers(catalog);
  const aliases = extractTableAliases(sql);
  const noStringsOrQuotes = stripStringLiterals(sql).replace(/"[^"]+"/g, " ");
  const tokenRegex = /\b[a-z_][a-z0-9_]*\b/gi;
  let match;

  while ((match = tokenRegex.exec(noStringsOrQuotes))) {
    const token = normalizeCompact(match[0]);
    if (
      SQL_ALLOWED_TOKENS.has(token) ||
      allowed.has(token) ||
      aliases.has(token)
    ) {
      continue;
    }

    throw new Error(`SQL izinli olmayan identifier kullandi: ${match[0]}`);
  }
}

export function validateSelectSql(sql, catalog, options = {}) {
  const normalizedSql = normalizeSelectSql(canonicalizeQuotedIdentifiers(sql, catalog));
  const allowedRefs = getTableReferences(catalog);
  const referencedTables = extractSqlTableReferences(normalizedSql);

  if (!referencedTables.length) {
    throw new Error("SQL izinli GDB/PostGIS tablosu icermiyor.");
  }

  const referencedLayers = [];
  for (const tableRef of referencedTables) {
    const table = allowedRefs.get(tableRef);
    if (!table) {
      throw new Error(`SQL izinli olmayan tablo kullandi: ${tableRef}`);
    }

    if (!referencedLayers.some((layer) => layer.id === table.layer.id)) {
      referencedLayers.push(table.layer);
    }
  }

  validateQuotedIdentifiers(normalizedSql, catalog);
  validateUnquotedIdentifiers(normalizedSql, catalog);

  if (options.requireCountOnly) {
    const countSql = normalizedSql.toLowerCase();
    const startsWithCount = /^select\s+count\s*\(/i.test(normalizedSql);
    const hasGroupBy = /\bgroup\s+by\b/i.test(normalizedSql);
    const hasOrderBy = /\border\s+by\b/i.test(normalizedSql);
    const hasLimit = /\blimit\b/i.test(normalizedSql);

    if (!startsWithCount || hasGroupBy || hasOrderBy || hasLimit || !/\bfrom\b/.test(countSql)) {
      throw new Error("Tahmini kayit sayisi sorgusu yalnizca SELECT COUNT(...) olabilir.");
    }
  }

  return {
    safe: true,
    sql: normalizedSql,
    referencedLayers
  };
}

export function getSafeSqlStatus(error = null) {
  return error ? { status: "blocked", message: error.message } : { status: "safe" };
}
