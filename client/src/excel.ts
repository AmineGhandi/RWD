import * as XLSX from "xlsx";
import { Room } from "./types";

export interface ParsedBoard {
  categories: { id: string; name: string }[];
  questions: {
    id: string;
    categoryId: string;
    value: number;
    text: string;
    answer: string;
  }[];
}

/**
 * Downloads a sample Excel template with 5 categories and 25 questions.
 */
export function downloadExcelTemplate() {
  const sampleData = [
    {
      Category: "Cinema",
      Points: 100,
      Question: "Which movie features the famous line 'I’ll be back'?",
      Answer: "The Terminator",
    },
    {
      Category: "Cinema",
      Points: 200,
      Question: "What is the name of the cowboy doll in Toy Story?",
      Answer: "Woody",
    },
    {
      Category: "Cinema",
      Points: 300,
      Question: "Which fictional school does Harry Potter attend?",
      Answer: "Hogwarts",
    },
    {
      Category: "Cinema",
      Points: 400,
      Question: "Who directed Jurassic Park (1993)?",
      Answer: "Steven Spielberg",
    },
    {
      Category: "Cinema",
      Points: 500,
      Question: "In The Matrix, which color pill does Neo take to see reality?",
      Answer: "The red pill",
    },

    {
      Category: "Gaming",
      Points: 100,
      Question: "Which Italian plumber is Nintendo’s iconic mascot?",
      Answer: "Mario",
    },
    {
      Category: "Gaming",
      Points: 200,
      Question: "Which bestselling game features Creepers and crafting tables?",
      Answer: "Minecraft",
    },
    {
      Category: "Gaming",
      Points: 300,
      Question: "In gaming terminology, what does NPC stand for?",
      Answer: "Non-Player Character",
    },
    {
      Category: "Gaming",
      Points: 400,
      Question: "In chess, which piece moves in an L-shape and can jump over others?",
      Answer: "The Knight",
    },
    {
      Category: "Gaming",
      Points: 500,
      Question: "What is the fictional continent in The Elder Scrolls called?",
      Answer: "Tamriel",
    },

    {
      Category: "Geography",
      Points: 100,
      Question: "What is the capital city of Morocco?",
      Answer: "Rabat",
    },
    {
      Category: "Geography",
      Points: 200,
      Question: "Which Moroccan city is famous worldwide for its blue streets?",
      Answer: "Chefchaouen",
    },
    {
      Category: "Geography",
      Points: 300,
      Question: "What is the largest hot desert in the world?",
      Answer: "The Sahara Desert",
    },
    {
      Category: "Geography",
      Points: 400,
      Question: "Which ocean borders Morocco to the west?",
      Answer: "The Atlantic Ocean",
    },
    {
      Category: "Geography",
      Points: 500,
      Question: "Which mountain range contains Mount Toubkal, North Africa's highest peak?",
      Answer: "The Atlas Mountains",
    },

    {
      Category: "Science",
      Points: 100,
      Question: "How many sides does a regular hexagon have?",
      Answer: "Six",
    },
    {
      Category: "Science",
      Points: 200,
      Question: "Which planet in our solar system is nicknamed the Red Planet?",
      Answer: "Mars",
    },
    {
      Category: "Science",
      Points: 300,
      Question: "What is the chemical symbol for Gold on the periodic table?",
      Answer: "Au",
    },
    {
      Category: "Science",
      Points: 400,
      Question: "What is the largest and deepest ocean on Earth?",
      Answer: "The Pacific Ocean",
    },
    {
      Category: "Science",
      Points: 500,
      Question: "Approximately how many bones are in the adult human skeleton?",
      Answer: "206",
    },

    {
      Category: "Music & Pop",
      Points: 100,
      Question: "Who is known as the 'King of Pop'?",
      Answer: "Michael Jackson",
    },
    {
      Category: "Music & Pop",
      Points: 200,
      Question: "Which British rock band released Bohemian Rhapsody?",
      Answer: "Queen",
    },
    {
      Category: "Music & Pop",
      Points: 300,
      Question: "How many strings does a standard acoustic guitar usually have?",
      Answer: "Six",
    },
    {
      Category: "Music & Pop",
      Points: 400,
      Question: "What year did the original Woodstock music festival take place?",
      Answer: "1969",
    },
    {
      Category: "Music & Pop",
      Points: 500,
      Question: "What is the musical term for playing notes in a smooth, connected manner?",
      Answer: "Legato",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData, {
    header: ["Category", "Points", "Question", "Answer"],
  });

  // Set column widths for readability
  ws["!cols"] = [
    { wch: 18 }, // Category
    { wch: 10 }, // Points
    { wch: 60 }, // Question
    { wch: 30 }, // Answer
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Quiz Board");
  XLSX.writeFile(wb, "rwd_quiz_template.xlsx");
}

/**
 * Exports the active room board to an Excel file so the host can edit and re-upload.
 */
export function exportCurrentBoard(room: Room) {
  const rows: { Category: string; Points: number; Question: string; Answer: string }[] = [];

  for (const cat of room.categories) {
    const qs = room.questions.filter((q) => q.categoryId === cat.id);
    for (const q of qs) {
      rows.push({
        Category: cat.name,
        Points: q.value,
        Question: q.text ?? "",
        Answer: q.answer ?? "",
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Category", "Points", "Question", "Answer"],
  });
  ws["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 60 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Board");
  XLSX.writeFile(wb, `rwd_board_${room.code}.xlsx`);
}

/**
 * Parses an uploaded Excel (.xlsx, .xls, .csv) file into a structured game board.
 */
export async function parseExcelFile(file: File): Promise<ParsedBoard> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  if (!workbook.SheetNames.length) {
    throw new Error("The uploaded Excel workbook contains no sheets.");
  }

  // Read the first worksheet
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  if (!rawRows.length) {
    throw new Error("The Excel sheet is empty. Please add questions and answers.");
  }

  // Detect header keys flexibly (case-insensitive)
  const firstRow = rawRows[0];
  const keys = Object.keys(firstRow);

  const findKey = (candidates: string[]): string | undefined =>
    keys.find((k) =>
      candidates.some(
        (c) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === c.toLowerCase().replace(/[^a-z0-9]/g, "")
      )
    );

  const catKey = findKey(["category", "categories", "cat", "theme", "topic", "section"]);
  const qKey = findKey(["question", "questions", "clue", "prompt", "text", "q"]);
  const aKey = findKey(["answer", "answers", "response", "solution", "a"]);
  const pKey = findKey(["points", "point", "value", "score", "val", "pts"]);

  if (!catKey || !qKey || !aKey) {
    throw new Error(
      `Could not identify columns in Excel file. Please ensure your sheet has headers: 'Category', 'Question', 'Answer' (and optionally 'Points').`
    );
  }

  // Group questions by category preserving order
  const categoryMap = new Map<string, { points: number; question: string; answer: string }[]>();

  for (let idx = 0; idx < rawRows.length; idx++) {
    const row = rawRows[idx];
    const catName = String(row[catKey] ?? "").trim();
    const qText = String(row[qKey] ?? "").trim();
    const aText = String(row[aKey] ?? "").trim();
    const rawPoints = pKey ? Number(row[pKey]) : 0;

    if (!catName && !qText && !aText) {
      continue; // skip completely empty rows
    }

    if (!catName) {
      throw new Error(`Row ${idx + 2} has a question but is missing a Category name.`);
    }
    if (!qText) {
      throw new Error(`Row ${idx + 2} in category '${catName}' is missing question text.`);
    }
    if (!aText) {
      throw new Error(`Row ${idx + 2} in category '${catName}' is missing an answer.`);
    }

    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, []);
    }

    const items = categoryMap.get(catName)!;
    const defaultPoints = (items.length + 1) * 100;
    const points = Number.isFinite(rawPoints) && rawPoints > 0 ? rawPoints : defaultPoints;

    items.push({
      points,
      question: qText,
      answer: aText,
    });
  }

  if (categoryMap.size === 0) {
    throw new Error("No valid questions found in the file.");
  }

  if (categoryMap.size > 10) {
    throw new Error(`The Excel file contains ${categoryMap.size} categories. Maximum allowed is 10.`);
  }

  const categories: { id: string; name: string }[] = [];
  const questions: {
    id: string;
    categoryId: string;
    value: number;
    text: string;
    answer: string;
  }[] = [];

  let catIndex = 0;
  for (const [name, qList] of categoryMap.entries()) {
    const catId = `c${catIndex}`;
    categories.push({ id: catId, name });

    // Limit to at most 10 questions per category (standard is 5)
    const clampedQuestions = qList.slice(0, 10);
    clampedQuestions.forEach((q, rowIdx) => {
      questions.push({
        id: `q${catIndex}-${rowIdx}`,
        categoryId: catId,
        value: q.points,
        text: q.question,
        answer: q.answer,
      });
    });

    catIndex++;
  }

  return { categories, questions };
}
