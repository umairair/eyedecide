// Ontario's 23 publicly funded universities. Facts that stay put: where it is,
// when it began, what language it teaches in, what it is known for, its site.
// Enrolment is left out on purpose, it moves every year.

export type Language = "English" | "French" | "Bilingual";

export type University = {
  name: string;
  /** main campus first */
  cities: string[];
  /** the year the institution began, under any earlier name */
  founded: number;
  language: Language;
  about: string;
  /** bare host, served over https */
  site: string;
};

export const UNIVERSITIES: University[] = [
  {
    name: "Algoma University",
    cities: ["Sault Ste. Marie", "Brampton", "Timmins"],
    founded: 1965,
    language: "English",
    about:
      "A small, mostly undergraduate university that began as a college affiliated with Laurentian and received its own charter in 2008.",
    site: "algomau.ca",
  },
  {
    name: "Brock University",
    cities: ["St. Catharines"],
    founded: 1964,
    language: "English",
    about:
      "Sits on the Niagara Escarpment and is known for co-op programs, the Goodman School of Business, and grape and wine research suited to the region around it.",
    site: "brocku.ca",
  },
  {
    name: "Carleton University",
    cities: ["Ottawa"],
    founded: 1942,
    language: "English",
    about:
      "Known for journalism, public affairs and international affairs, and aerospace engineering, on a campus between the Rideau River and the Rideau Canal.",
    site: "carleton.ca",
  },
  {
    name: "University of Guelph",
    cities: ["Guelph"],
    founded: 1964,
    language: "English",
    about:
      "Formed from three older colleges including the Ontario Agricultural College and the Ontario Veterinary College, and still best known for agriculture, food science and veterinary medicine.",
    site: "uoguelph.ca",
  },
  {
    name: "Lakehead University",
    cities: ["Thunder Bay", "Orillia"],
    founded: 1965,
    language: "English",
    about:
      "Serves northwestern Ontario from Thunder Bay with a second campus in Orillia, and is known for forestry, natural resources, engineering and the Bora Laskin Faculty of Law.",
    site: "lakeheadu.ca",
  },
  {
    name: "Laurentian University",
    cities: ["Sudbury"],
    founded: 1960,
    language: "Bilingual",
    about:
      "A bilingual university in northeastern Ontario known for mining engineering and earth sciences, and home to the McEwen School of Architecture.",
    site: "laurentian.ca",
  },
  {
    name: "McMaster University",
    cities: ["Hamilton"],
    founded: 1887,
    language: "English",
    about:
      "Founded in Toronto and moved to Hamilton in 1930, it is known for health sciences and engineering, for a medical school that pioneered problem-based learning, and for its research nuclear reactor.",
    site: "mcmaster.ca",
  },
  {
    name: "Nipissing University",
    cities: ["North Bay"],
    founded: 1992,
    language: "English",
    about:
      "A small university with small classes, best known for the Schulich School of Education and its teacher training.",
    site: "nipissingu.ca",
  },
  {
    name: "NOSM University",
    cities: ["Sudbury", "Thunder Bay"],
    founded: 2005,
    language: "English",
    about:
      "The Northern Ontario School of Medicine, which trained doctors as a joint faculty of Laurentian and Lakehead before becoming Canada's first independent medical university in 2022.",
    site: "nosm.ca",
  },
  {
    name: "OCAD University",
    cities: ["Toronto"],
    founded: 1876,
    language: "English",
    about:
      "Canada's oldest and largest art and design university, in downtown Toronto beside the Art Gallery of Ontario.",
    site: "ocadu.ca",
  },
  {
    name: "Ontario Tech University",
    cities: ["Oshawa"],
    founded: 2002,
    language: "English",
    about:
      "Legally the University of Ontario Institute of Technology, it focuses on technology, engineering and science, including nuclear engineering and automotive research.",
    site: "ontariotechu.ca",
  },
  {
    name: "University of Ottawa",
    cities: ["Ottawa"],
    founded: 1848,
    language: "Bilingual",
    about:
      "The largest English and French bilingual university in the world, a short walk from Parliament Hill, known for law in both the common and civil traditions, medicine and public policy.",
    site: "uottawa.ca",
  },
  {
    name: "Queen's University",
    cities: ["Kingston"],
    founded: 1841,
    language: "English",
    about:
      "One of Canada's oldest universities, chartered before Confederation, known for the Smith School of Business, engineering, law and medicine, and for a limestone campus where most students live close by.",
    site: "queensu.ca",
  },
  {
    name: "Toronto Metropolitan University",
    cities: ["Toronto"],
    founded: 1948,
    language: "English",
    about:
      "Known as Ryerson University until 2022, it is in the middle of downtown Toronto and is known for career-focused programs in media, journalism, business and engineering.",
    site: "torontomu.ca",
  },
  {
    name: "University of Toronto",
    cities: ["Toronto", "Mississauga"],
    founded: 1827,
    language: "English",
    about:
      "Canada's largest university, spread over the St. George, Scarborough and Mississauga campuses, with a college system and a research record that includes the discovery of insulin.",
    site: "utoronto.ca",
  },
  {
    name: "Trent University",
    cities: ["Peterborough", "Oshawa"],
    founded: 1964,
    language: "English",
    about:
      "Built along the Otonabee River around a college system, and known for environmental science and Indigenous studies.",
    site: "trentu.ca",
  },
  {
    name: "Université de Hearst",
    cities: ["Hearst", "Kapuskasing", "Timmins"],
    founded: 1953,
    language: "French",
    about:
      "A very small French-language university in northern Ontario where students take one course at a time in blocks, independent of Laurentian since 2022.",
    site: "uhearst.ca",
  },
  {
    name: "Université de l'Ontario français",
    cities: ["Toronto"],
    founded: 2018,
    language: "French",
    about:
      "Ontario's newest university, a French-language institution on the Toronto waterfront that welcomed its first students in 2021.",
    site: "uontario.ca",
  },
  {
    name: "University of Waterloo",
    cities: ["Waterloo"],
    founded: 1957,
    language: "English",
    about:
      "Known for engineering, computer science and its Faculty of Mathematics, and for running the largest co-op program of its kind, where students alternate study terms with paid work.",
    site: "uwaterloo.ca",
  },
  {
    name: "Western University",
    cities: ["London"],
    founded: 1878,
    language: "English",
    about:
      "Formally the University of Western Ontario, it is known for the Ivey Business School, the Schulich School of Medicine and Dentistry, and a collegiate gothic campus on the Thames River.",
    site: "uwo.ca",
  },
  {
    name: "Wilfrid Laurier University",
    cities: ["Waterloo", "Brantford"],
    founded: 1911,
    language: "English",
    about:
      "Began as a Lutheran seminary and is known today for the Lazaridis School of Business and Economics and its Faculty of Music.",
    site: "wlu.ca",
  },
  {
    name: "University of Windsor",
    cities: ["Windsor"],
    founded: 1857,
    language: "English",
    about:
      "Traces its start to Assumption College and took its current name in 1963, it sits beside the Ambassador Bridge to Detroit and is known for law and automotive engineering.",
    site: "uwindsor.ca",
  },
  {
    name: "York University",
    cities: ["Toronto", "Markham"],
    founded: 1959,
    language: "English",
    about:
      "One of the largest universities in the country, home to Osgoode Hall Law School, the Schulich School of Business and the bilingual Glendon campus.",
    site: "yorku.ca",
  },
];

export type Sort = "name" | "oldest" | "newest";
export const SORTS: Sort[] = ["name", "oldest", "newest"];

/** Lowercase, accents dropped, so "universite" finds "Université". */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** "University of Guelph" files under G, not U. */
const sortKey = (name: string) => fold(name).replace(/^(university of|universite de( l')?)\s*/, "");

/** Every word typed has to appear somewhere in the university's name, cities, language or blurb. */
export function find(query: string, sort: Sort, all: University[] = UNIVERSITIES): University[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hits = all.filter((u) => {
    const hay = fold([u.name, u.cities.join(" "), u.language, u.about, u.site].join(" "));
    return words.every((w) => hay.includes(w));
  });
  return hits.sort((a, b) => {
    if (sort === "oldest" && a.founded !== b.founded) return a.founded - b.founded;
    if (sort === "newest" && a.founded !== b.founded) return b.founded - a.founded;
    return sortKey(a.name).localeCompare(sortKey(b.name));
  });
}
