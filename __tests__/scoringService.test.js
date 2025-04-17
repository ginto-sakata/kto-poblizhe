// __tests__/scoringService.test.js

const scoringService = require('../scoringService');

//============================= describe parseValue =============================
describe('scoringService.parseValue', () => {
    test('should parse basic integers', () => {
        expect(scoringService.parseValue('100')).toBe(100);
        expect(scoringService.parseValue('-50')).toBe(-50);
    });

    test('should parse basic floats', () => {
        expect(scoringService.parseValue('123.45')).toBe(123.45);
        expect(scoringService.parseValue('-0.5')).toBe(-0.5);
    });

    test('should handle commas as decimal separators', () => {
        expect(scoringService.parseValue('123,45')).toBe(123.45);
    });

    test('should handle spaces', () => {
        expect(scoringService.parseValue(' 1 000 000 ')).toBe(1000000);
        expect(scoringService.parseValue(' 123. 45 ')).toBe(123.45);
    });

    test('should handle various magnitudes with/without spaces', () => {
        //======================== --- Thousands ---
        expect(scoringService.parseValue('10k')).toBe(10000);
        expect(scoringService.parseValue('10к')).toBe(10000);
        expect(scoringService.parseValue('10 к')).toBe(10000);
        expect(scoringService.parseValue('2.5тыс')).toBe(2500);
        expect(scoringService.parseValue('2.5 тыс')).toBe(2500);
        expect(scoringService.parseValue('1 тысяча')).toBe(1000);
        expect(scoringService.parseValue('1 ТысячА')).toBe(1000);
        expect(scoringService.parseValue('5 тысяч')).toBe(5000); // Plural test

        //======================== --- Millions ---
        expect(scoringService.parseValue('1.5 млн')).toBe(1500000);
        expect(scoringService.parseValue('0.5m')).toBe(500000);
        expect(scoringService.parseValue('0.5м')).toBe(500000);
        expect(scoringService.parseValue('0.5 м')).toBe(500000);
        expect(scoringService.parseValue('2кк')).toBe(2000000);
        expect(scoringService.parseValue('2 кк')).toBe(2000000);
        expect(scoringService.parseValue('1 миллион')).toBe(1000000);
        expect(scoringService.parseValue('1 МИЛЛИОН')).toBe(1000000);
        expect(scoringService.parseValue('7 миллионов')).toBe(7000000); // Plural test

        //======================== --- Billions ---
        expect(scoringService.parseValue('3 млрд')).toBe(3000000000);
        expect(scoringService.parseValue('1b')).toBe(1000000000);
        expect(scoringService.parseValue('1б')).toBe(1000000000);
        expect(scoringService.parseValue('1 б')).toBe(1000000000);
        expect(scoringService.parseValue('4ккк')).toBe(4000000000);
        expect(scoringService.parseValue('4 ккк')).toBe(4000000000);
        expect(scoringService.parseValue('2 миллиарда')).toBe(2000000000); // Plural test
        expect(scoringService.parseValue('6 миллиардов')).toBe(6000000000); // Plural test
    });

     test('should handle percentages', () => {
         expect(scoringService.parseValue('50%')).toBe(50);
         expect(scoringService.parseValue(' 12.5 % ')).toBe(12.5);
     });

    test('should handle infinity strings', () => {
        expect(scoringService.parseValue('infinity')).toBe(Infinity);
        expect(scoringService.parseValue('бесконечность')).toBe(Infinity);
        expect(scoringService.parseValue(' Бесконечно ')).toBe(Infinity);
    });

    test('should handle BC dates and variations', () => {
        expect(scoringService.parseValue('500 до н.э.')).toBe(-500);
        expect(scoringService.parseValue('100 bc')).toBe(-100);
        expect(scoringService.parseValue(' 77 B.C.E. ')).toBe(-77);
        expect(scoringService.parseValue('150 до нэ')).toBe(-150); // New variation
        expect(scoringService.parseValue('200 до н/э')).toBe(-200); // New variation
        expect(scoringService.parseValue('250 до н\\э')).toBe(-250); // New variation (double backslash for regex literal)
        expect(scoringService.parseValue('300 ДО Н.Э.')).toBe(-300); // Case-insensitivity test
    });

    test('should return null for invalid inputs', () => {
        expect(scoringService.parseValue('')).toBeNull();
        expect(scoringService.parseValue('abc')).toBeNull();
        expect(scoringService.parseValue(null)).toBeNull();
        expect(scoringService.parseValue(undefined)).toBeNull();
        expect(scoringService.parseValue('10 cats')).toBeNull();
        expect(scoringService.parseValue('1.2.3')).toBeNull();
        expect(scoringService.parseValue('тыс')).toBeNull(); // Just suffix
        expect(scoringService.parseValue('млн')).toBeNull(); // Just suffix
    });
});

//============================= describe evaluateNumerically =============================
describe('scoringService.evaluateNumerically', () => {
    const players = {
        p1: { id: 'p1', name: 'Alice', answer: '100' },
        p2: { id: 'p2', name: 'Bob', answer: '150' },
        p3: { id: 'p3', name: 'Charlie', answer: '95' },
        p4: { id: 'p4', name: 'David', answer: '100km' },
        p5: { id: 'p5', name: 'Eve', answer: ' 100 ' },
        p6: { id: 'p6', name: 'Frank', answer: 'infinity' },
        p7: { id: 'p7', name: 'Grace', answer: 'бесконечность' },
        p8: { id: 'p8', name: 'Heidi', answer: '100 до н.э.' },
        p9: { id: 'p9', name: 'Ivan', answer: '-100' },
    };

    test('should award 3 points for exact match', () => {
        const scores = scoringService.evaluateNumerically('100', { p1: players.p1, p5: players.p5 });
        expect(scores).toEqual({ p1: 3, p5: 3 });
    });

    test('should award 3 points for exact negative/BC match', () => {
        const scores = scoringService.evaluateNumerically('-100', { p9: players.p9 });
        expect(scores).toEqual({ p9: 3 });
        const scoresBC = scoringService.evaluateNumerically('100 до н.э.', { p8: players.p8 });
        expect(scoresBC).toEqual({ p8: 3 });
    });

     test('should award 3 points for exact infinity match', () => {
         const scores = scoringService.evaluateNumerically('infinity', { p6: players.p6, p7: players.p7 });
         expect(scores).toEqual({ p6: 3, p7: 3 });
     });

    test('should award 2 points for the single closest answer', () => {
        const scores = scoringService.evaluateNumerically('110', { p1: players.p1, p2: players.p2, p3: players.p3 });
        expect(scores).toEqual({ p1: 2, p2: 0, p3: 0 });
    });

    test('should award 2 points to multiple equally closest answers', () => {
        const scores = scoringService.evaluateNumerically('125', { p1: players.p1, p2: players.p2, p3: players.p3 });
        expect(scores).toEqual({ p1: 2, p2: 2, p3: 0 });
    });

    test('should award 0 points if answer is not parsable', () => {
        const scores = scoringService.evaluateNumerically('100', { p4: players.p4 });
        expect(scores).toEqual({ p4: 0 });
    });

     test('should award 0 points if correct answer is not parsable numerically (and not infinity/range)', () => {
         const scores = scoringService.evaluateNumerically('> 50', players);
         expect(Object.values(scores).every(s => s === 0)).toBe(true);
         const scores2 = scoringService.evaluateNumerically('approx 100', players);
         expect(Object.values(scores2).every(s => s === 0)).toBe(true);
     });

    test('should award 3 points for answers within a range', () => {
        const scores = scoringService.evaluateNumerically('98-102', { p1: players.p1, p5: players.p5, p3: players.p3 });
        expect(scores).toEqual({ p1: 3, p5: 3, p3: 0 });
    });

    test('should award 2 points for closest outside a range', () => {
        const scores = scoringService.evaluateNumerically('110-120', { p1: players.p1, p2: players.p2, p3: players.p3 });
        expect(scores).toEqual({ p1: 2, p2: 0, p3: 0 });
    });

     test('should handle empty players object', () => {
         const scores = scoringService.evaluateNumerically('100', {});
         expect(scores).toEqual({});
     });

     test('should handle negative number input for BC date answers', () => {
        const players = {
            p_neg: { id: 'p_neg', name: 'Neg', answer: '-500' },
            p_bc: { id: 'p_bc', name: 'BC', answer: '500 до н.э.' },
            p_pos: { id: 'p_pos', name: 'Pos', answer: '500' },
        };
        const scores = scoringService.evaluateNumerically('500 до н.э.', players);
        expect(scores).toEqual({ p_neg: 3, p_bc: 3, p_pos: 0 }); // Both -500 and 500 BC should be correct

        const scores2 = scoringService.evaluateNumerically('-500', players); // Correct answer could also be negative
         expect(scores2).toEqual({ p_neg: 3, p_bc: 3, p_pos: 0 });
    });

    test('should handle null/undefined correct answer', () => {
         const scores = scoringService.evaluateNumerically(null, { p1: players.p1 });
         expect(scores).toEqual({ p1: 0 });
         const scores2 = scoringService.evaluateNumerically(undefined, { p1: players.p1 });
         expect(scores2).toEqual({ p1: 0 });
     });
});