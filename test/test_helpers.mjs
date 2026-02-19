/**
 * Unit tests for scripts/helpers.mjs
 * Uses Node.js built-in test runner (node:test) and assert.
 * Run: node --test test/test_helpers.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    parseRunInfo,
    buildResultBaseUrl,
    parseMaybeJson,
    getProgressRoots,
    collectFailedRuleOutputs,
    parseJobMetadata,
    extractCodexAnswer
} from '../scripts/helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'));

// ── parseRunInfo ──────────────────────────────────────────────────────

describe('parseRunInfo', () => {
    it('extracts runId, outputId, and anonymousKey from a standard URL', () => {
        const url = 'https://prover.certora.com/output/12345/abcdef123456?anonymousKey=secret123';
        const info = parseRunInfo(url);
        assert.equal(info.origin, 'https://prover.certora.com');
        assert.equal(info.runId, '12345');
        assert.equal(info.outputId, 'abcdef123456');
        assert.equal(info.anonymousKey, 'secret123');
    });

    it('handles URL with trailing slash', () => {
        const url = 'https://prover.certora.com/output/12345/abcdef123456/';
        const info = parseRunInfo(url);
        assert.equal(info.runId, '12345');
        assert.equal(info.outputId, 'abcdef123456');
    });

    it('handles URL with multiple trailing slashes', () => {
        const url = 'https://prover.certora.com/output/12345/abcdef123456///';
        const info = parseRunInfo(url);
        assert.equal(info.runId, '12345');
        assert.equal(info.outputId, 'abcdef123456');
    });

    it('returns empty string for missing anonymousKey (not undefined)', () => {
        const url = 'https://prover.certora.com/output/12345/abcdef123456';
        const info = parseRunInfo(url);
        assert.equal(info.anonymousKey, '');
    });

    it('handles empty anonymousKey param', () => {
        const url = 'https://prover.certora.com/output/12345/abcdef123456?anonymousKey=';
        const info = parseRunInfo(url);
        assert.equal(info.anonymousKey, '');
    });
});

// ── buildResultBaseUrl ────────────────────────────────────────────────

describe('buildResultBaseUrl', () => {
    it('constructs the result URL from runInfo', () => {
        const info = { origin: 'https://prover.certora.com', runId: '111', outputId: 'aaa' };
        assert.equal(buildResultBaseUrl(info), 'https://prover.certora.com/result/111/aaa');
    });
});

// ── parseMaybeJson ────────────────────────────────────────────────────

describe('parseMaybeJson', () => {
    it('parses a valid JSON string', () => {
        assert.deepEqual(parseMaybeJson('{"a":1}'), { a: 1 });
    });

    it('returns original string if not valid JSON', () => {
        assert.equal(parseMaybeJson('not json'), 'not json');
    });

    it('returns non-string values as-is', () => {
        const obj = { x: 42 };
        assert.equal(parseMaybeJson(obj), obj);
        assert.equal(parseMaybeJson(null), null);
        assert.equal(parseMaybeJson(undefined), undefined);
    });
});

// ── getProgressRoots ──────────────────────────────────────────────────

describe('getProgressRoots', () => {
    it('extracts rule roots from verificationProgress wrapper', () => {
        const progress = fixture('progress_sample.json');
        const roots = getProgressRoots(progress);
        assert.ok(Array.isArray(roots), 'should return an array');
        assert.equal(roots.length, 4);
        assert.equal(roots[0].name, 'validation_pendingDepositRequest_canIncrease');
    });

    it('extracts roots when given a JSON string', () => {
        const progress = fixture('progress_sample.json');
        const roots = getProgressRoots(JSON.stringify(progress));
        assert.equal(roots.length, 4);
    });

    it('extracts roots from a flat rules array', () => {
        const data = { rules: [{ name: 'r1', status: 'VIOLATED' }] };
        const roots = getProgressRoots(data);
        assert.equal(roots.length, 1);
        assert.equal(roots[0].name, 'r1');
    });

    it('returns empty array for null/undefined', () => {
        assert.deepEqual(getProgressRoots(null), []);
        assert.deepEqual(getProgressRoots(undefined), []);
    });
});

// ── collectFailedRuleOutputs ──────────────────────────────────────────

describe('collectFailedRuleOutputs', () => {
    const runInfo = { origin: 'https://prover.certora.com', runId: '111', outputId: 'aaa', anonymousKey: 'key1' };

    it('collects VIOLATED and SANITY_FAILED by default', () => {
        const progress = fixture('progress_sample.json');
        const roots = getProgressRoots(progress);
        const results = [];
        for (const root of roots) {
            collectFailedRuleOutputs(root, runInfo, results);
        }
        // Should get: top-level VIOLATED, child cancelDeposit VIOLATED, sanity_check SANITY_FAILED
        // Should NOT get: fulfillDeposit (VERIFIED), verified_rule (VERIFIED)
        const names = results.map(r => r.ruleName);
        assert.ok(names.some(n => n.includes('validation_pendingDepositRequest_canIncrease')));
        assert.ok(names.some(n => n.includes('cancelDeposit')));
        assert.ok(names.some(n => n.includes('sanity_check')));
        assert.ok(!names.some(n => n.includes('verified_rule')));
        assert.ok(!names.some(n => n.includes('fulfillDeposit')));
        assert.equal(results.length, 3);
    });

    it('includes anonymousKey in the URL', () => {
        const progress = fixture('progress_sample.json');
        const roots = getProgressRoots(progress);
        const results = [];
        for (const root of roots) {
            collectFailedRuleOutputs(root, runInfo, results);
        }
        assert.ok(results[0].url.includes('anonymousKey=key1'));
    });

    it('omits anonymousKey from URL when empty', () => {
        const info = { ...runInfo, anonymousKey: '' };
        const root = { name: 'r', status: 'VIOLATED', output: ['treeView/out.json'], children: [] };
        const results = collectFailedRuleOutputs(root, info);
        assert.ok(!results[0].url.includes('anonymousKey'));
    });

    it('collects all rules when includeAll is set', () => {
        const progress = fixture('progress_sample.json');
        const roots = getProgressRoots(progress);
        const results = [];
        for (const root of roots) {
            collectFailedRuleOutputs(root, runInfo, results, [], { includeAll: true });
        }
        // Should include the VERIFIED rules too (those with output files)
        const names = results.map(r => r.ruleName);
        assert.ok(names.some(n => n.includes('fulfillDeposit')));
        assert.ok(names.some(n => n.includes('verified_rule')));
    });

    it('matches rules by name with includeRuleMatch (additive with default filter)', () => {
        const progress = fixture('progress_sample.json');
        const roots = getProgressRoots(progress);
        const results = [];
        for (const root of roots) {
            collectFailedRuleOutputs(root, runInfo, results, [], { includeRuleMatch: 'verified_rule' });
        }
        // Default filter gives 3 (VIOLATED + SANITY_FAILED).
        // includeRuleMatch adds "verified_rule" which is VERIFIED and wouldn't normally be included.
        assert.equal(results.length, 4);
        assert.ok(results.some(r => r.ruleName.includes('verified_rule')));
    });
});

// ── parseJobMetadata ──────────────────────────────────────────────────

describe('parseJobMetadata', () => {
    it('extracts all metadata fields from output.json', () => {
        const data = fixture('output_json_sample.json');
        const meta = parseJobMetadata(data);
        assert.equal(meta.jobStatus, 'COMPLETED');
        assert.equal(meta.proverTime, 342);
        assert.equal(meta.contractName, 'VaultHarness');
        assert.equal(meta.specFile, 'certora/specs/vault.spec');
        assert.equal(meta.solcVersion, '0.8.20');
        assert.equal(meta.proverVersion, '7.5.0');
        assert.equal(meta.ruleSanity, 'basic');
    });

    it('produces correct rulesSummary for mixed rules object', () => {
        const data = fixture('output_json_sample.json');
        const meta = parseJobMetadata(data);
        // 3 top-level entries:
        //   "validation_pendingDepositRequest_canIncrease": "SUCCESS" → passed
        //   "validation_authEnforcement": { SUCCESS: [...], VIOLATED: [...] } → has failures → failed
        //   "validation_noSideEffect_transfer": "VIOLATED" → failed
        assert.equal(meta.rulesSummary.passed, 1);
        assert.equal(meta.rulesSummary.failed, 2);
        assert.equal(meta.rulesSummary.total, 3);
    });

    it('returns null for null/undefined input', () => {
        assert.equal(parseJobMetadata(null), null);
        assert.equal(parseJobMetadata(undefined), null);
    });

    it('returns null for non-object input', () => {
        assert.equal(parseJobMetadata('string'), null);
        assert.equal(parseJobMetadata(42), null);
    });

    it('handles missing conf or rules gracefully', () => {
        const meta = parseJobMetadata({ jobStatus: 'RUNNING' });
        assert.equal(meta.jobStatus, 'RUNNING');
        assert.equal(meta.ruleSanity, null);
        assert.equal(meta.rulesSummary, null);
    });
});

// ── extractCodexAnswer ────────────────────────────────────────────────

describe('extractCodexAnswer', () => {
    it('extracts the answer block before the last "tokens used:"', () => {
        const output = [
            '[2025-01-01T00:00:00Z] codex --model o4-mini',
            'workdir: /tmp/test',
            'Here is my analysis:',
            'The rule fails because x > y.',
            '12345 tokens used: ...'
        ].join('\n');
        const result = extractCodexAnswer(output);
        assert.ok(result.includes('Here is my analysis'));
        assert.ok(result.includes('The rule fails because x > y'));
        assert.ok(!result.includes('tokens used'));
        assert.ok(!result.includes('codex --model'));
    });

    it('prefers the last tokens-used block', () => {
        const output = [
            '[2025-01-01T00:00:00Z] exec codex',
            'first attempt answer',
            '100 tokens used: ...',
            '[2025-01-01T00:00:01Z] exec codex',
            'second attempt: this is correct',
            '200 tokens used: ...'
        ].join('\n');
        const result = extractCodexAnswer(output);
        assert.ok(result.includes('second attempt'));
    });

    it('falls back to "Final answer:" marker', () => {
        const output = [
            'Some preamble...',
            'Final answer:',
            'The fix is to add a require statement.'
        ].join('\n');
        const result = extractCodexAnswer(output);
        assert.ok(result.includes('The fix is to add a require statement'));
    });

    it('falls back to full output when no markers found', () => {
        const output = 'Just plain text with no markers.';
        const result = extractCodexAnswer(output);
        assert.equal(result, output);
    });

    it('filters meta lines from result', () => {
        const output = [
            '[2025-01-01T00:00:00Z] start',
            'provider: openai',
            'model: o4-mini',
            'Actual analysis content',
            '100 tokens used: done'
        ].join('\n');
        const result = extractCodexAnswer(output);
        assert.ok(!result.includes('provider:'));
        assert.ok(!result.includes('model:'));
        assert.ok(result.includes('Actual analysis content'));
    });
});
