export const releaseConsoleDependencies = [
  {
    id: "apps-in-toss-qr-preview",
    dependsOn: ["apps-in-toss-ait-upload"]
  },
  {
    id: "apps-in-toss-deployment-approval",
    dependsOn: [
      "apps-in-toss-ait-upload",
      "apps-in-toss-qr-preview",
      "apps-in-toss-category-exposure",
      "apps-in-toss-game-rating"
    ]
  },
  {
    id: "google-play-track-preview",
    dependsOn: [
      "google-play-signed-aab-upload",
      "google-play-content-rating",
      "google-play-korea-game-rating",
      "google-play-data-safety"
    ]
  },
  {
    id: "app-store-review-metadata",
    dependsOn: [
      "app-store-signed-build-upload",
      "app-store-age-rating",
      "app-store-privacy-export"
    ]
  }
];

export function getReleaseConsoleDependenciesById() {
  return new Map(releaseConsoleDependencies.map((entry) => [entry.id, entry.dependsOn]));
}
