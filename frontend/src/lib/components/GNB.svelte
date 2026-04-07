<nav class="gnb">
  <img src="/favicon.svg" alt="Portal Space" width="24" height="24" />
  <span class="title">Portal Space</span>
</nav>

<style>
  .gnb {
    height: var(--gnb-height, 48px);
    background: #1a1a2e;
    border-bottom: 1px solid #0f3460;
    position: relative;
    z-index: 200;
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 10px;
  }

  .title {
    color: var(--color-primary, #06b6d4);
    font-size: 1.1rem;
    font-weight: bold;
    font-family: 'MulmaruMono', monospace;
  }

  @media (max-width: 767px) {
    .title {
      display: none;
    }
  }
</style>
