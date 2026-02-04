package gates

# Gate_HC_ENDPOINT
deny[msg] {
    input.healthcheck.root != 200
    msg := "Gate_HC_ENDPOINT: healthcheck.root must be 200"
}

deny[msg] {
    input.healthcheck.pairs != 200
    msg := "Gate_HC_ENDPOINT: healthcheck.pairs must be 200"
}

# Gate_INDEX_REPRODUCIBLE
deny[msg] {
    # Check for healthcheck files
    not has_file_pattern(input.index_files, "reports/healthcheck_root.txt")
    msg := "Gate_INDEX_REPRODUCIBLE: Missing reports/healthcheck_root.txt in index"
}

deny[msg] {
    not has_file_pattern(input.index_files, "reports/healthcheck_pairs.txt")
    msg := "Gate_INDEX_REPRODUCIBLE: Missing reports/healthcheck_pairs.txt in index"
}

deny[msg] {
    # Check for report_file if specified in envelope
    input.report_file
    not has_file_exact(input.index_files, input.report_file)
    msg := sprintf("Gate_INDEX_REPRODUCIBLE: Missing report_file '%v' in index", [input.report_file])
}

# Check size > 0 and SHA format for ALL files
deny[msg] {
    file := input.index_files[_]
    file.size <= 0
    msg := sprintf("Gate_INDEX_REPRODUCIBLE: File '%v' has size <= 0", [file.path])
}

deny[msg] {
    file := input.index_files[_]
    not regex.match("^[0-9a-f]{8}$", file.sha256_short)
    msg := sprintf("Gate_INDEX_REPRODUCIBLE: File '%v' has invalid SHA '%v' (must be 8 hex)", [file.path, file.sha256_short])
}

# Gate_NO_EXTERNAL_EVIDENCE
deny[msg] {
    count(input.forbidden_phrases_hit) > 0
    msg := sprintf("Gate_NO_EXTERNAL_EVIDENCE: Found forbidden phrases: %v", [input.forbidden_phrases_hit])
}

# Helpers
has_file_pattern(files, pattern) {
    file := files[_]
    contains(file.path, pattern)
}

has_file_exact(files, path_str) {
    file := files[_]
    file.path == path_str
}
