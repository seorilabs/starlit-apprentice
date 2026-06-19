export const pacingPlans = {
  "guided-balanced": {
    expectedTopEnding: "mentor",
    months: [
      ["star-lore", "letters", "home-rest", "park"],
      ["music", "manners", "home-rest", "plaza"],
      ["crafts", "tea-service", "home-rest", "library-help"]
    ]
  },
  academic: {
    expectedTopEnding: "scholar",
    months: [
      ["star-lore", "letters", "library-help", "home-rest"],
      ["star-lore", "letters", "library", "sleep-in"],
      ["letters", "scribe-aide", "home-rest", "park"]
    ]
  },
  creative: {
    expectedTopEnding: "performer",
    months: [
      ["music", "theater-crew", "plaza", "home-rest"],
      ["music", "crafts", "park", "sleep-in"],
      ["theater-crew", "plaza", "home-rest", "market"]
    ]
  },
  "work-heavy": {
    expectedTopEnding: "merchant",
    months: [
      ["library-help", "tea-service", "workshop-errand", "home-rest"],
      ["garden-care", "theater-crew", "scribe-aide", "sleep-in"],
      ["tea-service", "market", "home-rest", "park"]
    ]
  }
};

export const manualQaRouteCues = {
  guidedBalancedPacing: pacingPlans["guided-balanced"].months,
  firstMonthEvent: [pacingPlans["guided-balanced"].months[0]]
};
