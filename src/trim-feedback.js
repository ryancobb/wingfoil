export function trimFeedback(t) {
  const states = {
    flagged: ['Wing flagged', 'Wing flagged. Power up to catch the wind again.'],
    calm: ['No apparent wind', 'Too little airflow to load the wing. Wait for wind or increase it in settings.'],
    heading: ['Steer across wind', t.idealTrim === 1
      ? 'Too close to the wind. Turn away onto a reach before sheeting in.'
      : 'Too far downwind for clean trim. Turn across the wind, or flag to coast.'],
    luffing: ['Sheet in · luffing', 'Wing fluttering? Sheet in gently until it fills.'],
    stalled: ['Ease out · stalled', 'Sheeted in too far. Ease out to restore airflow and drive.'],
    under: ['Sheet in a little', 'Sheet in for more pull. The green band follows apparent wind.'],
    over: ['Ease out a little', 'Ease out toward the green band before the wing stalls.'],
    sweet: ['Clean airflow', 'Trim is good. As you accelerate, sheet in to follow the apparent wind.'],
  };
  const [label, hint] = states[t.trimState] || states.calm;
  return { label, hint, good: t.trimState === 'sweet', showTarget: t.trimAvailable && t.trimState !== 'flagged' };
}
