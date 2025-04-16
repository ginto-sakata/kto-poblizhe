// scoringService.js

/**
 * Parses a string potentially representing a number, including magnitudes and percentages.
 * Returns a number, Infinity, or null if parsing fails.
 * Handles simple BC year notations.
 *
 * @param {string | number | null | undefined} valueStr The input string to parse.
 * @returns {number | null} The parsed number, Infinity, or null.
 */
function parseValue(valueStr) {
    if (valueStr === null || valueStr === undefined) return null;
    let originalStr = String(valueStr).trim().toLowerCase();
    if (!originalStr) return null;

    if (['бесконечно', 'бесконечность', 'бесконечное число', 'infinity'].includes(originalStr)) {
        return Infinity;
    }

    const bcMatch = originalStr.match(/^(\d+)\s*(?:до н\.э\.|b\.?c\.?e?\.?|bc|н\.э\.)$/);
    if (bcMatch) {
        const year = parseInt(bcMatch[1], 10);
        return !isNaN(year) ? -year : null;
    }

    let multiplier = 1;
    let strToParse = originalStr;

    if (strToParse.endsWith('квинтиллионов')) { multiplier = 1e18; strToParse = strToParse.replace(/квинтиллионов$/, '').trim(); }
    else if (strToParse.endsWith('млрд') || strToParse.endsWith('b') || strToParse.endsWith('миллиардов')) { multiplier = 1e9; strToParse = strToParse.replace(/млрд|b|миллиардов$/, '').trim(); }
    else if (strToParse.endsWith('млн') || strToParse.endsWith('m') || strToParse.endsWith('миллионов')) { multiplier = 1e6; strToParse = strToParse.replace(/млн|m|миллионов$/, '').trim(); }
    else if (strToParse.endsWith('тыс') || strToParse.endsWith('тысяч') || strToParse.endsWith('k')) { multiplier = 1e3; strToParse = strToParse.replace(/тыс|тысяч|k$/, '').trim(); }
    else if (strToParse.endsWith('%')) { strToParse = strToParse.replace(/%$/, '').trim(); }

    if (!strToParse) return null;

    const numStr = strToParse.replace(/,/g, '.').replace(/\s/g, '');

    if (/^(-?\d+(?:\.\d+)?)[eE][+-]?\d+$/.test(numStr)) {
        const sciValue = parseFloat(numStr);
        return !isNaN(sciValue) ? sciValue * multiplier : null;
    }
    if (/^(-?\d+(?:\.\d+)?)$/.test(numStr)) {
        const numValue = parseFloat(numStr);
        return !isNaN(numValue) ? numValue * multiplier : null;
    }

    // console.warn(`Could not parse player value: "${originalStr}"`); // Optional logging
    return null; // Failed to parse
}


/**
 * Evaluates player answers numerically against a potentially complex correct answer string.
 * Handles exact numbers, numerical ranges, and infinity. Falls back for other types.
 * Awards 3 points for exact match or within range, 2 for closest otherwise, 0 for others.
 *
 * @param {string} correctAnswerRaw The raw correct answer string from the question data.
 * @param {object} players Object with player IDs as keys and player objects { id, name, answer } as values.
 * @returns {object} Object with player IDs as keys and scores (0, 2, or 3) as values.
 */
function evaluateNumerically(correctAnswerRaw, players) {
    const scores = {};
    const playerEntries = (players && typeof players === 'object') ? Object.entries(players) : [];

    if (correctAnswerRaw === null || correctAnswerRaw === undefined) {
        console.warn(`Numerical Eval: Null/undefined correct answer. Scoring 0.`);
        playerEntries.forEach(([id]) => scores[id] = 0);
        return scores;
    }

    const correctAnswerStr = String(correctAnswerRaw).trim().toLowerCase();
    let minDiff = Infinity;
    let evaluationType = 'unknown';
    let correctValue = null;
    let rangeLower = null;
    let rangeUpper = null;

    // Determine evaluation type
    if (['бесконечно', 'бесконечность', 'бесконечное число', 'infinity'].includes(correctAnswerStr)) {
        evaluationType = 'infinity';
        correctValue = Infinity;
    } else {
        const rangeMatch = correctAnswerStr.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|–|—|до|to)\s*(-?\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
            rangeLower = parseFloat(rangeMatch[1]);
            rangeUpper = parseFloat(rangeMatch[2]);
            if (!isNaN(rangeLower) && !isNaN(rangeUpper)) {
                evaluationType = 'range';
                if (rangeLower > rangeUpper) [rangeLower, rangeUpper] = [rangeUpper, rangeLower];
                correctValue = (rangeLower + rangeUpper) / 2; // Midpoint for diff calculation
            } else {
                evaluationType = 'unknown';
                console.warn(`Numerical Eval: Malformed range: "${correctAnswerRaw}"`);
            }
        } else if (/^(?:>|>=|<|<=|больше|менее|более|менее|до|от)\s*-?\d/.test(correctAnswerStr)) {
            evaluationType = 'unknown';
            console.warn(`Numerical Eval: Comparison op found: "${correctAnswerRaw}".`);
        } else if (/\d+\s*(?:до н\.э\.|b\.?c\.?e?\.?|bc|н\.э\.)$/.test(correctAnswerStr)) {
             correctValue = parseValue(correctAnswerStr);
             evaluationType = (correctValue !== null) ? 'exact' : 'unknown';
             if(evaluationType === 'unknown') console.warn(`Numerical Eval: Failed to parse BC date: "${correctAnswerRaw}"`);
        } else {
            correctValue = parseValue(correctAnswerStr);
            evaluationType = (correctValue !== null) ? 'exact' : 'unknown';
             if(evaluationType === 'unknown') console.warn(`Numerical Eval: Cannot parse as number/range/inf: "${correctAnswerRaw}"`);
        }
    }

    // Handle Unknown/Fallback
    if (evaluationType === 'unknown') {
        console.warn(`Numerical Eval cannot handle: "${correctAnswerRaw}". Scoring 0.`);
        playerEntries.forEach(([id]) => scores[id] = 0);
        return scores;
    }

    // Evaluate Player Answers
    const playerResults = playerEntries.map(([id, player]) => {
        if (!player || typeof player !== 'object') { return { id, diff: Infinity, isExact: false }; }
        const playerValue = parseValue(player.answer);
        let diff = Infinity; let isExact = false;
        if (playerValue !== null) {
            if (evaluationType === 'infinity') { isExact = (playerValue === Infinity); diff = isExact ? 0 : Infinity; }
            else if (evaluationType === 'range') { isExact = (playerValue >= rangeLower && playerValue <= rangeUpper); diff = isExact ? 0 : Math.min(Math.abs(playerValue - rangeLower), Math.abs(playerValue - rangeUpper)); }
            else { isExact = (playerValue === correctValue); diff = Math.abs(playerValue - correctValue); }
        }
        if (!isExact && diff < minDiff) { minDiff = diff; }
        return { id, diff, isExact };
    });

    // Assign Scores
    playerResults.forEach(pa => {
        if (pa.isExact) { scores[pa.id] = 3; }
        else if (evaluationType !== 'infinity' && pa.diff === minDiff && minDiff !== Infinity) { scores[pa.id] = 2; }
        else { scores[pa.id] = 0; }
    });

    return scores;
}

module.exports = {
    parseValue,
    evaluateNumerically
};