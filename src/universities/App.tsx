import { useMemo, useState } from "react";
import { SORTS, find, type Sort } from "./data";

export function App() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const shown = useMemo(() => find(query, sort), [query, sort]);

  return (
    <main className="wrap">
      <h1 className="title">ontario universities</h1>

      <div className="bar">
        <input
          className="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search"
          aria-label="search"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="sorts" role="group" aria-label="sort">
          {SORTS.map((s) => (
            <button key={s} className="sort" aria-pressed={sort === s} onClick={() => setSort(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className="count" aria-live="polite">
        {shown.length} of 23
      </p>

      <ul className="list">
        {shown.map((u) => (
          <li key={u.name} className="uni">
            <h2 className="uni__name">{u.name}</h2>
            <p className="uni__facts">
              <span>{u.cities.join(", ")}</span>
              <span>{u.founded}</span>
              <span>{u.language}</span>
            </p>
            <p className="uni__about">{u.about}</p>
            <a className="uni__site" href={`https://${u.site}`} target="_blank" rel="noreferrer">
              {u.site}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
