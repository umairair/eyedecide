/**
 * A phone or tablet: something driven by touch. The game is not offered there,
 * the tracking is built for a webcam above a screen you sit in front of, and
 * a screen held in the hand is too small and too unsteady for it.
 * (iPads call themselves Macs, so the pointer is asked as well as the name.)
 */
export const handheld = () =>
  window.matchMedia?.("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
