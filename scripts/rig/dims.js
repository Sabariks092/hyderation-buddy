// Skeleton dimensions in reference-image pixels (ground at y = 0, up is negative).
const LEG1 = 94, LEG2 = 92, ANKLE = 24, ARM1 = 64, ARM2 = 62;
module.exports = { LEG1, LEG2, ANKLE, ARM1, ARM2, HIP: -(LEG1 + LEG2 + ANKLE - 1.5), GROUND_REF: 805 };
