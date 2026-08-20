import { readFile, writeFile } from "node:fs/promises";

const organization = process.env.GITHUB_ORGANIZATION ?? "nmorgowicz-org";
const token = process.env.GITHUB_TOKEN;

async function fetchRepositories() {
  const repositories = [];

  for (let page = 1; ; page += 1) {
    const url = new URL(`https://api.github.com/orgs/${organization}/repos`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", "updated");

    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "User-Agent": "nmorgowicz-org-profile-updater",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API request failed (${response.status}): ${await response.text()}`);
    }

    const pageRepositories = await response.json();
    repositories.push(...pageRepositories);
    if (pageRepositories.length < 100) return repositories;
  }
}

function projectMarkdown(repository) {
  const language = repository.language ?? "Mixed languages";
  const pushed = repository.pushed_at ? repository.pushed_at.slice(0, 10) : "not yet pushed";
  const description = repository.description ?? "No description provided yet.";

  return [
    `### [${repository.name}](${repository.html_url})`,
    "",
    description,
    "",
    `${language} · ⭐ ${repository.stargazers_count} · Forks ${repository.forks_count} · Last pushed ${pushed}`,
  ].join("\n");
}

const repositories = (await fetchRepositories())
  .filter((repository) => !repository.private && !repository.archived && repository.name !== ".github")
  .sort((left, right) => (right.pushed_at ?? "").localeCompare(left.pushed_at ?? ""));

const stars = repositories.reduce((total, repository) => total + repository.stargazers_count, 0);
const forks = repositories.reduce((total, repository) => total + repository.forks_count, 0);
const starLabel = stars === 1 ? "star" : "stars";
const summary = `**${repositories.length} public projects** · ⭐ ${stars} ${starLabel} · Forks ${forks}`;
const projects = repositories.length
  ? [summary, "", repositories.map(projectMarkdown).join("\n\n")].join("\n")
  : `${summary}\n\nNo public projects are currently listed.`;

const readmePath = "profile/README.md";
const readme = await readFile(readmePath, "utf8");
const marker = /<!-- PROJECTS:START -->[\s\S]*?<!-- PROJECTS:END -->/;

if (!marker.test(readme)) {
  throw new Error(`Could not find project markers in ${readmePath}`);
}

const updatedReadme = readme.replace(
  marker,
  `<!-- PROJECTS:START -->\n\n${projects}\n\n<!-- PROJECTS:END -->`,
);

if (updatedReadme !== readme) {
  await writeFile(readmePath, updatedReadme);
  console.log(`Updated ${readmePath} with ${repositories.length} public projects.`);
} else {
  console.log(`${readmePath} is already current.`);
}
