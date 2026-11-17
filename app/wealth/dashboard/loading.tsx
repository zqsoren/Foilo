import "./wealth.css";
export default function WealthLoading() {
  return (
    <main className="ax" aria-busy="true">
      <header className="ax-header">
        <div className="ax-identity">
          <strong>在侧 Folio</strong>
          <span>资产</span>
        </div>
      </header>
      <div className="ax-card ax-empty" role="status">
        正在读取账户与汇率…
      </div>
    </main>
  );
}
