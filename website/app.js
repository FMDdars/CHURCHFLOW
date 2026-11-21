const REPO_API = 'https://api.github.com/repos/FMDdars/CHURCHFLOW/releases/latest';
const RELEASES_URL = 'https://github.com/FMDdars/CHURCHFLOW/releases/latest';

document.getElementById('year').textContent = new Date().getFullYear();

const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');
menuToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
mainNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  mainNav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));

async function loadLatestRelease() {
  const version = document.getElementById('releaseVersion');
  const date = document.getElementById('releaseDate');
  const installer = document.getElementById('installerLink');
  const portable = document.getElementById('portableLink');
  const status = document.getElementById('downloadStatus');

  try {
    const response = await fetch(REPO_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error('Release information is not available yet.');
    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const setupAsset = assets.find(asset => /ChurchFlow-Setup-.*\.exe$/i.test(asset.name));
    const portableAsset = assets.find(asset => /ChurchFlow-Portable-.*\.exe$/i.test(asset.name));

    version.textContent = release.tag_name ? `Latest release ${release.tag_name}` : 'Latest published release';
    if (release.published_at) {
      date.textContent = new Date(release.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
    installer.href = setupAsset?.browser_download_url || release.html_url || RELEASES_URL;
    portable.href = portableAsset?.browser_download_url || release.html_url || RELEASES_URL;
    status.textContent = setupAsset
      ? 'Installer link points to the latest published ChurchFlow release.'
      : 'Open the official releases page to choose an available Windows download.';
  } catch (error) {
    version.textContent = 'Latest version on GitHub';
    date.textContent = '';
    installer.href = RELEASES_URL;
    portable.href = RELEASES_URL;
    status.textContent = 'The release list could not be loaded just now. Use the official releases page to view available downloads.';
  }
}
loadLatestRelease();