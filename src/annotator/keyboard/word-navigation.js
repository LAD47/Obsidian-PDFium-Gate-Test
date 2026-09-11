'use strict';

// Unicode word/punctuation caret boundaries for Ctrl/Cmd+Shift+Left/Right.
function createKeyboardWordNavigation(options) {
  const { documentNormalized, clampCaretPos } = options;
    // word-wise movement remains only a focus-position primitive.
    // It deliberately reuses the existing anchor/focus/seed, hidden-index,
    // reversal, overlay and autoscroll logic below. A word is Unicode
    // letter/number/mark/underscore. Whitespace is a separator; punctuation
    // forms its own boundary group.
    const wordClassAt = index => {
        if (!Number.isFinite(index) || index < 0 || index >= documentNormalized.length)
            return 'edge';
        const ch = documentNormalized[index];
        if (/\s/u.test(ch))
            return 'space';
        if (/[\p{L}\p{N}\p{M}_]/u.test(ch))
            return 'word';
        return 'punct';
    };
    const wordCaretTarget = (caretPos, horizontalDirection) => {
        let i = clampCaretPos(caretPos);
        if (horizontalDirection === 'right') {
            if (i >= documentNormalized.length)
                return i;
            let cls = wordClassAt(i);
            if (cls === 'space') {
                while (i < documentNormalized.length && wordClassAt(i) === 'space')
                    i += 1;
                if (i >= documentNormalized.length)
                    return i;
                cls = wordClassAt(i);
            }
            if (cls === 'word') {
                while (i < documentNormalized.length && wordClassAt(i) === 'word')
                    i += 1;
                return clampCaretPos(i);
            }
            if (cls === 'punct') {
                while (i < documentNormalized.length && wordClassAt(i) === 'punct')
                    i += 1;
                return clampCaretPos(i);
            }
            return clampCaretPos(i);
        }
        if (horizontalDirection === 'left') {
            if (i <= 0)
                return i;
            let j = i - 1;
            let cls = wordClassAt(j);
            if (cls === 'space') {
                while (j >= 0 && wordClassAt(j) === 'space')
                    j -= 1;
                if (j < 0)
                    return 0;
                cls = wordClassAt(j);
            }
            if (cls === 'word') {
                while (j >= 0 && wordClassAt(j) === 'word')
                    j -= 1;
                return clampCaretPos(j + 1);
            }
            if (cls === 'punct') {
                while (j >= 0 && wordClassAt(j) === 'punct')
                    j -= 1;
                return clampCaretPos(j + 1);
            }
            return clampCaretPos(j + 1);
        }
        return i;
    };


  return Object.freeze({ wordCaretTarget });
}

module.exports = { createKeyboardWordNavigation };
