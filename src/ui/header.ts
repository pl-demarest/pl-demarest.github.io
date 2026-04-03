export function initHeader(): void {
  const header = document.getElementById('header');
  if (!header) return;

  header.innerHTML = `
    <div class="header-top">
      <span class="header-name">Phillip Demarest, PhD</span>
    </div>
    <nav class="header-nav">
      <button class="header-menu-btn" aria-label="Menu">&#9776;</button>
      <a href="#" class="header-link">About</a>
      <a href="#" class="header-link">Projects</a>
      <a href="#" class="header-link">Contact</a>
    </nav>
  `;
}
