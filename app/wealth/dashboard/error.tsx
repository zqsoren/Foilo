"use client";
export default function WealthError({ reset }: { reset: () => void }) {
  return (
    <main className="ax">
      <section className="ax-card ax-empty" role="alert">
        <h1>暂时无法读取资产</h1>
        <p>请稍后重试，已保存的余额记录不会因此丢失。</p>
        <button className="ax-primary" onClick={reset}>
          重新读取
        </button>
      </section>
    </main>
  );
}
