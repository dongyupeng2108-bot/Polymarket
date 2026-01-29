package gates

# Gate_HC_ENDPOINT
deny contains msg if {
  input.healthcheck.root != 200
  msg := "Gate_HC_ENDPOINT: healthcheck.root must be 200"
}

deny contains msg if {
  input.healthcheck.pairs != 200
  msg := "Gate_HC_ENDPOINT: healthcheck.pairs must be 200"
}

# Gate_INDEX_REPRODUCIBLE
deny contains msg if {
  not has_file_pattern(input.index_files, "reports/healthcheck_root.txt")
  msg := "Gate_INDEX_REPRODUCIBLE: Missing reports/healthcheck_root.txt in index"
}

deny contains msg if {
  not has_file_pattern(input.index_files, "reports/healthcheck_pairs.txt")
  msg := "Gate_INDEX_REPRODUCIBLE: Missing reports/healthcheck_pairs.txt in index"
}

deny contains msg if {
  input.report_file
  not has_file_exact(input.index_files, input.report_file)
  msg := sprintf("Gate_INDEX_REPRODUCIBLE: Missing report_file '%v' in index", [input.report_file])
}

# Check size > 0 and SHA format for ALL files
deny contains msg if {
  some i
  file := input.index_files[i]
  file.size <= 0
  msg := sprintf("Gate_INDEX_REPRODUCIBLE: File '%v' has size <= 0", [file.path])
}

deny contains msg if {
  some i
  file := input.index_files[i]
  not regex.match("^[0-9a-f]{8}$", file.sha256_short)
  msg := sprintf("Gate_INDEX_REPRODUCIBLE: File '%v' has invalid SHA '%v' (must be 8 hex)", [file.path, file.sha256_short])
}

# Gate_NO_EXTERNAL_EVIDENCE
deny contains msg if {
  count(input.forbidden_phrases_hit) > 0
  msg := sprintf("Gate_NO_EXTERNAL_EVIDENCE: Found forbidden phrases: %v", [input.forbidden_phrases_hit])
}

# Helpers (Rego v1 style)
has_file_pattern(files, pattern) if {
  some i
  contains(files[i].path, pattern)
}

has_file_exact(files, path_str) if {
  some i
  files[i].path == path_str
}
