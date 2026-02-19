/*
 * Pure utility functions for Certora Scraper.
 * Extracted from certora_auto_server.mjs for testability.
 * Copyright (c) 2025 Nala.
 * License: ISC (see root LICENSE file).
 */

/**
 * Parse a Certora Prover result URL into its components.
 */
export function parseRunInfo(urlStr) {
    const u = new URL(urlStr.replace(/\/+$/, '')); // strip trailing slashes
    const parts = u.pathname.split('/').filter(Boolean);
    let runId, outputId;
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'output' && parts[i - 1] !== 'outputs') {
            runId = parts[i + 1];
            outputId = parts[i + 2];
            break;
        }
    }
    const anonymousKey = u.searchParams.get('anonymousKey') || '';
    return { origin: `${u.protocol}//${u.host}`, runId, outputId, anonymousKey };
}

/**
 * Build the base result URL for fetching auxiliary files.
 */
export function buildResultBaseUrl(runInfo) {
    return `${runInfo.origin}/result/${runInfo.runId}/${runInfo.outputId}`;
}

/**
 * Parse a value that may be either a JSON string or already-parsed object.
 */
export function parseMaybeJson(val) {
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return val; }
    }
    return val;
}

/**
 * Extract rule roots from the progress JSON (handles multiple wrapper formats).
 */
export function getProgressRoots(progressJson) {
    const roots = [];
    if (!progressJson) return roots;
    const pj = parseMaybeJson(progressJson);
    if (pj && pj.verificationProgress != null) {
        const vp = parseMaybeJson(pj.verificationProgress);
        if (vp) {
            if (vp.rules) return Array.isArray(vp.rules) ? vp.rules : [vp.rules];
            if (Array.isArray(vp)) return vp;
            if (vp.children) return Array.isArray(vp.children) ? vp.children : [vp.children];
        }
    }
    if (pj && pj.rules) return Array.isArray(pj.rules) ? pj.rules : [pj.rules];
    if (Array.isArray(pj)) return pj;
    if (pj && pj.children) return Array.isArray(pj.children) ? pj.children : [pj.children];
    return roots;
}

/**
 * Walk the progress tree and collect rules matching the filter criteria.
 * By default: VIOLATED and SANITY_FAILED.
 * With includeSatisfied: any non-VERIFIED rule.
 * With includeAll: every rule.
 * With includeRuleMatch: rules whose path contains the substring.
 */
export function collectFailedRuleOutputs(node, runInfo, results = [], currentPath = [], opts = {}) {
    if (!node) return results;

    const name = node.name || '';
    const status = (node.status || '').toUpperCase();
    const output = Array.isArray(node.output) ? node.output : [];
    const children = Array.isArray(node.children) ? node.children : [];
    const nextPath = currentPath.concat(name);

    const includeSatisfied = Boolean(opts.includeSatisfied);
    const includeAll = Boolean(opts.includeAll);
    const includeRuleMatch = typeof opts.includeRuleMatch === 'string' && opts.includeRuleMatch.trim() ? opts.includeRuleMatch.trim().toLowerCase() : null;
    const rulePathLower = nextPath.join(' > ').toLowerCase();
    const matchesName = includeRuleMatch && rulePathLower.includes(includeRuleMatch);

    if (status && output.length > 0 && (
        matchesName ||
        includeAll ||
        (includeSatisfied && status !== 'VERIFIED') ||
        (!includeSatisfied && (status === 'VIOLATED' || status === 'SANITY_FAILED'))
    )) {
        for (const outputFile of output) {
            if (typeof outputFile === 'string' && /\.json$/i.test(outputFile)) {
                const baseUrl = `${runInfo.origin}/result/${runInfo.runId}/${runInfo.outputId}`;
                const params = new URLSearchParams();
                if (runInfo.anonymousKey) {
                    params.append('anonymousKey', runInfo.anonymousKey);
                }
                params.append('output', outputFile);
                const fullUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;

                results.push({
                    ruleName: nextPath.join(' > '),
                    status: status,
                    outputFile: outputFile,
                    url: fullUrl
                });
            }
        }
    } else if (includeSatisfied && status && output.length === 0 && status !== 'VERIFIED') {
        const snapshotFields = ['message', 'counterExample', 'counterexample', 'trace', 'callTrace',
            'output_type_information', 'contract_call_summaries', 'storage_initial_state',
            'assertions', 'assertMessage', 'treeViewPath', 'variables', 'callResolutionWarnings'];
        const nodeSnapshot = { name: node.name, status };
        for (const field of snapshotFields) {
            if (field in node) nodeSnapshot[field] = node[field];
        }
        results.push({
            ruleName: nextPath.join(' > '),
            status: status,
            outputFile: null,
            url: null,
            nodeSnapshot
        });
    }

    for (const child of children) {
        collectFailedRuleOutputs(child, runInfo, results, nextPath, opts);
    }

    return results;
}

/**
 * Parse output.json into structured job metadata.
 * (Pure function: takes data object, no network calls.)
 */
export function parseJobMetadata(data) {
    if (!data || typeof data !== 'object') return null;
    const meta = {
        jobStatus: data.jobStatus ?? null,
        proverTime: data.proverTime ?? null,
        contractName: data.contractName ?? null,
        specFile: data.specFile ?? null,
        solcVersion: data.solcVersion ?? null,
        proverVersion: data.proverVersion ?? null,
        ruleSanity: null,
        rulesSummary: null
    };
    if (data.conf && typeof data.conf === 'object') {
        meta.ruleSanity = data.conf.rule_sanity ?? data.conf.ruleSanity ?? null;
    }
    if (data.rules) {
        let passed = 0, failed = 0;
        const rules = data.rules;
        if (typeof rules === 'object' && !Array.isArray(rules)) {
            for (const [key, val] of Object.entries(rules)) {
                if (typeof val === 'string') {
                    if (val === 'SUCCESS') passed++; else failed++;
                } else if (typeof val === 'object') {
                    const successCount = Array.isArray(val.SUCCESS) ? val.SUCCESS.length : 0;
                    const failCount = Object.entries(val).filter(([k]) => k !== 'SUCCESS').reduce((s, [, v]) => s + (Array.isArray(v) ? v.length : 0), 0);
                    if (failCount === 0) passed++; else failed++;
                }
            }
        } else if (Array.isArray(rules)) {
            for (const r of rules) {
                const s = (r.status || '').toUpperCase();
                if (s === 'VERIFIED' || s === 'SUCCESS') passed++; else failed++;
            }
        }
        meta.rulesSummary = { passed, failed, total: passed + failed };
    }
    return meta;
}

// Process Codex output, extract only the final answer
export function extractCodexAnswer(fullOutput) {
    const lines = fullOutput.split('\n');
    const tokenIdxs = [];
    for (let i = 0; i < lines.length; i++) {
        if (/tokens used:/i.test(lines[i])) tokenIdxs.push(i);
    }

    const isMetaLine = (l) => (
        /^\[[\d\-T:\.Z]+\]/.test(l) ||
        /\] (exec|bash -lc|codex|thinking)\b/i.test(l) ||
        /workdir:|model:|provider:|approval:|sandbox:|reasoning/i.test(l) ||
        /OpenAI Codex/i.test(l)
    );

    for (let k = tokenIdxs.length - 1; k >= 0; k--) {
        const t = tokenIdxs[k];
        let s = -1;
        for (let i = t - 1; i >= 0; i--) {
            if (/^\[[\d\-T:\.Z]+\]/.test(lines[i])) { s = i; break; }
        }
        const slice = lines.slice(s + 1, t);
        const filtered = slice.filter(l => !isMetaLine(l)).join('\n').trim();
        if (filtered) return filtered;
    }

    const finalIdx = lines.findIndex(l => /^(Final answer|Final answer)\s*:/i.test(l));
    if (finalIdx !== -1) {
        return lines.slice(finalIdx + 1).join('\n').trim();
    }

    let userInstrIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('User instructions:')) { userInstrIdx = i; break; }
    }
    let candidate = (userInstrIdx >= 0 ? lines.slice(userInstrIdx + 1) : lines)
        .filter(l => !isMetaLine(l) && !/tokens used:/i.test(l))
        .join('\n').trim();
    return candidate || fullOutput;
}
