// scoringService.js

//============================= parseValue Function =============================
function parseValue(valueStr) {
    if (valueStr === null || valueStr === undefined) return null;
    let originalStr = String(valueStr).trim().toLowerCase();
    if (!originalStr) return null;

    //======================== --- Reject ~ Prefixed Strings ---
    if (originalStr.startsWith('~')) {
        return null; // Treat approximate values as non-numerical for this parser
    }

    if (['бесконечно', 'бесконечность', 'бесконечное число', 'infinity'].includes(originalStr)) {
        return Infinity;
    }

    const bcMatch = originalStr.match(/^(\d+)\s*(?:до н\.э\.|до нэ|до н\/э|до н\\э|b\.?c\.?e?\.?|bc|н\.э\.)$/i); // Added variations and case-insensitivity
    if (bcMatch) {
        const year = parseInt(bcMatch[1], 10);
        return !isNaN(year) ? -year : null;
    }

    let multiplier = 1;
    let numPart = originalStr;

    //======================== --- Regex for Number and Suffix ---
    // Regex to capture number and optional suffix (abbreviations or full words) with space
    // Reordered suffix alternatives: ккк, billions, kk, millions, k, thousands
    const match = originalStr.match(/^(-?\s*\d+[\s,.]*\d*)\s*(ккк|миллиардов|миллиарда|миллиард|млрд|б|b|кк|миллионов|миллион|млн|м|m|тысяч|тысяча|тыс|к|k)?$/i);

    if (match) {
        numPart = match[1];
        const suffix = match[2]?.toLowerCase();

        if (suffix) {
            //======================== --- Check Suffix for Multiplier ---
            if (suffix === 'ккк' || suffix === 'б' || suffix === 'b' || suffix === 'млрд' || suffix === 'миллиард' || suffix === 'миллиарда' || suffix === 'миллиардов') {
                multiplier = 1e9;
            } else if (suffix === 'кк' || suffix === 'м' || suffix === 'm' || suffix === 'млн' || suffix === 'миллион' || suffix === 'миллионов') {
                multiplier = 1e6;
            } else if (suffix === 'к' || suffix === 'k' || suffix === 'тыс' || suffix === 'тысяч' || suffix === 'тысяча') {
                multiplier = 1e3;
            }
        }
    } else {
        //======================== --- Handle Percentage if No Magnitude ---
         if (originalStr.endsWith('%')) {
             numPart = originalStr.replace(/%$/, '').trim();
         } else {
             numPart = originalStr;
         }
    }

    //======================== --- Clean and Parse Number Part ---
    const numStr = numPart.replace(/,/g, '.').replace(/\s/g, '');

    if (!numStr) return null;

    if (/^(-?\d+(?:\.\d+)?)[eE][+-]?\d+$/.test(numStr)) {
        const sciValue = parseFloat(numStr);
        return !isNaN(sciValue) ? sciValue * multiplier : null;
    }
    if (/^(-?\d+(?:\.\d+)?)$/.test(numStr)) {
        const numValue = parseFloat(numStr);
        return !isNaN(numValue) ? numValue * multiplier : null;
    }

    return null;
}

//============================= evaluateNumerically Function =============================
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

    //======================== --- Determine Correct Answer Type ---
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
                correctValue = (rangeLower + rangeUpper) / 2;
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

    //======================== --- Handle Unknown/Fallback ---
    if (evaluationType === 'unknown') {
        console.warn(`Numerical Eval cannot handle: "${correctAnswerRaw}". Scoring 0.`);
        playerEntries.forEach(([id]) => scores[id] = 0);
        return scores;
    }

    //======================== --- Evaluate Player Answers ---
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

    //======================== --- Assign Scores ---
    const anyExact = playerResults.some(pa => pa.isExact);

    playerResults.forEach(pa => {
        if (pa.isExact) {
            scores[pa.id] = 3;
        } else if (!anyExact && evaluationType !== 'infinity' && pa.diff === minDiff && minDiff !== Infinity) {
            scores[pa.id] = 2;
        } else {
            scores[pa.id] = 0;
        }
    });

    return scores;
}

module.exports = {
    parseValue,
    evaluateNumerically
};