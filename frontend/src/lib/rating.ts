// The rating scale is an open product decision (Ratings specification, Open
// Questions). Nothing outside this file may assume five stars: screens render
// <RatingInput>/<RatingValue> from this config, so changing the scale means
// changing one object once the decision is recorded.
export interface RatingScale {
  min: number;
  max: number;
  // Optional label for a value, e.g. { 1: "Poor" }.
  labels?: Record<number, string>;
}

export const PROVISIONAL_RATING_SCALE: RatingScale = { min: 1, max: 5 };
