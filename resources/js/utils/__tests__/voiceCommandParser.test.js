import { describe, it, expect } from 'vitest';
import { parseVoiceCommand, applyAliases } from '@/utils/voiceCommandParser';

const elements = [
    { id: 1, label: 'Burako', input_type: 'boolean' },
    { id: 2, label: 'Clean Canastra', input_type: 'quantity' },
    { id: 3, label: 'Dirty Canastra', input_type: 'quantity' },
    { id: 4, label: 'Clean Cut', input_type: 'boolean' },
    { id: 5, label: 'Dirty A Canastra', input_type: 'quantity' },
];

const teams = [
    { id: 10, name: 'The Cracks' },
    { id: 11, name: 'The Wolves' },
];

describe('parseVoiceCommand', () => {
    describe('save commands', () => {
        it('returns save for "save round"', () => {
            expect(parseVoiceCommand('save round', elements, teams)).toEqual({ type: 'save' });
        });

        it('returns save for "record round"', () => {
            expect(parseVoiceCommand('record round', elements, teams)).toEqual({ type: 'save' });
        });

        it('returns save for "save"', () => {
            expect(parseVoiceCommand('save', elements, teams)).toEqual({ type: 'save' });
        });

        it('returns save for "submit round"', () => {
            expect(parseVoiceCommand('submit round', elements, teams)).toEqual({ type: 'save' });
        });

        it('returns save for "submit"', () => {
            expect(parseVoiceCommand('submit', elements, teams)).toEqual({ type: 'save' });
        });
    });

    describe('element commands — exact match', () => {
        it('parses "add dirty canastra to the cracks"', () => {
            const result = parseVoiceCommand('add dirty canastra to the cracks', elements, teams);
            expect(result).toEqual({
                type: 'element',
                action: 'add',
                elementId: 3,
                teamId: 10,
                quantity: 1,
            });
        });

        it('parses "remove clean canastra from the wolves"', () => {
            const result = parseVoiceCommand('remove clean canastra from the wolves', elements, teams);
            expect(result).toEqual({
                type: 'element',
                action: 'remove',
                elementId: 2,
                teamId: 11,
                quantity: 1,
            });
        });

        it('parses "add two dirty canastra to the wolves"', () => {
            const result = parseVoiceCommand('add two dirty canastra to the wolves', elements, teams);
            expect(result).toEqual({
                type: 'element',
                action: 'add',
                elementId: 3,
                teamId: 11,
                quantity: 2,
            });
        });

        it('parses "add 3 clean canastra to the cracks"', () => {
            const result = parseVoiceCommand('add 3 clean canastra to the cracks', elements, teams);
            expect(result).toEqual({
                type: 'element',
                action: 'add',
                elementId: 2,
                teamId: 10,
                quantity: 3,
            });
        });

        it('parses "zero dirty canastra for the cracks"', () => {
            const result = parseVoiceCommand('zero dirty canastra for the cracks', elements, teams);
            expect(result).toEqual({
                type: 'element',
                action: 'zero',
                elementId: 3,
                teamId: 10,
                quantity: 1,
            });
        });

        it('parses "set burako for the cracks"', () => {
            const result = parseVoiceCommand('set burako for the cracks', elements, teams);
            expect(result).toEqual({
                type: 'element',
                action: 'set',
                elementId: 1,
                teamId: 10,
                quantity: 1,
            });
        });

        it('maps "clear" to zero action', () => {
            const result = parseVoiceCommand('clear dirty canastra for the wolves', elements, teams);
            expect(result.action).toBe('zero');
        });

        it('maps "minus" to remove action', () => {
            const result = parseVoiceCommand('minus clean canastra from the cracks', elements, teams);
            expect(result.action).toBe('remove');
        });

        it('maps "subtract" to remove action', () => {
            const result = parseVoiceCommand('subtract clean canastra from the cracks', elements, teams);
            expect(result.action).toBe('remove');
        });
    });

    describe('word numbers', () => {
        it.each([
            ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5],
            ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
        ])('maps "%s" to %d', (word, expected) => {
            const result = parseVoiceCommand(
                `add ${word} dirty canastra to the cracks`,
                elements,
                teams,
            );
            expect(result.type).toBe('element');
            expect(result.quantity).toBe(expected);
        });
    });

    describe('fuzzy matching', () => {
        it('matches "dirty canasta" to Dirty Canastra (1 char off)', () => {
            const result = parseVoiceCommand('add dirty canasta to the cracks', elements, teams);
            expect(result.type).toBe('element');
            expect(result.elementId).toBe(3);
        });

        it('matches "the crack" to The Cracks (1 char off)', () => {
            const result = parseVoiceCommand('add dirty canastra to the crack', elements, teams);
            expect(result.type).toBe('element');
            expect(result.teamId).toBe(10);
        });

        it('matches "burako" with case insensitivity', () => {
            const result = parseVoiceCommand('add BURAKO for THE CRACKS', elements, teams);
            expect(result.type).toBe('element');
            expect(result.elementId).toBe(1);
        });

        it('matches "clean cut" exactly', () => {
            const result = parseVoiceCommand('add clean cut to the wolves', elements, teams);
            expect(result.type).toBe('element');
            expect(result.elementId).toBe(4);
        });
    });

    describe('unknown commands', () => {
        it('returns unknown for unstructured transcript', () => {
            const result = parseVoiceCommand('hello there', elements, teams);
            expect(result.type).toBe('unknown');
            expect(result.reason).toBeTruthy();
        });

        it('returns unknown when element is not recognised', () => {
            const result = parseVoiceCommand('add foobarxyz to the cracks', elements, teams);
            expect(result.type).toBe('unknown');
            expect(result.reason).toContain('not recognised');
        });

        it('returns unknown when team is not recognised', () => {
            const result = parseVoiceCommand('add dirty canastra to the xxxxxx', elements, teams);
            expect(result.type).toBe('unknown');
            expect(result.reason).toContain('not recognised');
        });

        it('returns unknown for empty string', () => {
            const result = parseVoiceCommand('', elements, teams);
            expect(result.type).toBe('unknown');
        });
    });

    describe('voice aliases — applyAliases()', () => {
        it('returns the transcript unchanged when no aliases are provided', () => {
            expect(applyAliases('add morocco to the cracks', [])).toBe('add morocco to the cracks');
        });

        it('replaces a single alias word', () => {
            const aliases = [{ alias: 'morocco', keyword: 'burako' }];
            expect(applyAliases('add morocco to the cracks', aliases)).toBe('add burako to the cracks');
        });

        it('replacement is case-insensitive', () => {
            const aliases = [{ alias: 'morocco', keyword: 'burako' }];
            expect(applyAliases('add Morocco to the cracks', aliases)).toBe('add burako to the cracks');
            expect(applyAliases('add MOROCCO to the cracks', aliases)).toBe('add burako to the cracks');
        });

        it('does not replace partial word matches', () => {
            const aliases = [{ alias: 'can', keyword: 'burako' }];
            expect(applyAliases('add canastra to team', aliases)).toBe('add canastra to team');
        });

        it('handles multi-word aliases', () => {
            const aliases = [{ alias: 'new york', keyword: 'canastra' }];
            expect(applyAliases('add new york to team', aliases)).toBe('add canastra to team');
        });

        it('processes longer aliases before shorter ones to prevent partial clobbering', () => {
            const aliases = [
                { alias: 'add new', keyword: 'set old' },
                { alias: 'add new stuff', keyword: 'zero old stuff' },
            ];
            expect(applyAliases('add new stuff to team', aliases)).toBe('zero old stuff to team');
        });

        it('applies multiple aliases in one pass', () => {
            const aliases = [
                { alias: 'morocco', keyword: 'burako' },
                { alias: 'canada', keyword: 'canastra' },
            ];
            expect(applyAliases('add morocco and canada to team', aliases))
                .toBe('add burako and canastra to team');
        });
    });

    describe('voice aliases — parseVoiceCommand with aliases', () => {
        const aliases = [{ alias: 'morocco', keyword: 'burako' }];

        it('resolves a misheard element name via an alias', () => {
            const result = parseVoiceCommand('add morocco to the cracks', elements, teams, aliases);
            expect(result).toEqual({
                type: 'element',
                action: 'add',
                elementId: 1,
                teamId: 10,
                quantity: 1,
            });
        });

        it('resolves a misheard save phrase via alias substitution', () => {
            const savePhraseAlias = [{ alias: 'save now', keyword: 'save round' }];
            const result = parseVoiceCommand('save now', elements, teams, savePhraseAlias);
            expect(result).toEqual({ type: 'save' });
        });

        it('falls back to unknown when alias keyword is also unrecognised', () => {
            const badAlias = [{ alias: 'morocco', keyword: 'totallymadeup' }];
            const result = parseVoiceCommand('add morocco to the cracks', elements, teams, badAlias);
            expect(result.type).toBe('unknown');
        });

        it('works correctly with an empty aliases array', () => {
            const result = parseVoiceCommand('add burako to the cracks', elements, teams, []);
            expect(result).toEqual({
                type: 'element',
                action: 'add',
                elementId: 1,
                teamId: 10,
                quantity: 1,
            });
        });
    });
});
