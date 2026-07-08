export interface CompanyPreset {
  company: string;
  icon: string;
  topics: string[];
  mcq_count: number;
  coding_count: number;
  duration_minutes: number;
  difficulty: string;
  description: string;
}

export const COMPANY_PRESETS: CompanyPreset[] = [
  {
    company: "Google SDE-2",
    icon: "G",
    topics: ["Graphs", "DP", "Trees"],
    mcq_count: 0,
    coding_count: 2,
    duration_minutes: 75,
    difficulty: "hard",
    description: "2 hard algo problems, pure coding",
  },
  {
    company: "Amazon SDE-1",
    icon: "A",
    topics: ["Arrays", "Graphs", "OOPs"],
    mcq_count: 3,
    coding_count: 2,
    duration_minutes: 90,
    difficulty: "medium",
    description: "3 MCQs + 2 coding, leadership principles",
  },
  {
    company: "Microsoft SDE",
    icon: "M",
    topics: ["Trees", "Strings", "DP"],
    mcq_count: 2,
    coding_count: 2,
    duration_minutes: 90,
    difficulty: "medium",
    description: "Balanced mix, behavioral + coding",
  },
  {
    company: "Meta SDE-E4",
    icon: "F",
    topics: ["Graphs", "Arrays", "Sliding Window"],
    mcq_count: 0,
    coding_count: 2,
    duration_minutes: 70,
    difficulty: "hard",
    description: "Speed-focused, 2 hard problems",
  },
  {
    company: "Flipkart SDE-1",
    icon: "Fl",
    topics: ["Arrays", "Binary Search", "Strings"],
    mcq_count: 5,
    coding_count: 2,
    duration_minutes: 90,
    difficulty: "medium",
    description: "Heavy MCQ + 2 coding problems",
  },
  {
    company: "Atlassian SE",
    icon: "At",
    topics: ["System Design", "Graphs", "DP"],
    mcq_count: 2,
    coding_count: 2,
    duration_minutes: 90,
    difficulty: "medium",
    description: "System design focus + algo",
  },
  {
    company: "Oracle Java Dev",
    icon: "Or",
    topics: ["OOPs", "DBMS", "CN"],
    mcq_count: 6,
    coding_count: 1,
    duration_minutes: 60,
    difficulty: "medium",
    description: "Heavy theory, Java/DB concepts",
  },
  {
    company: "Uber SDE-1",
    icon: "U",
    topics: ["Graphs", "Greedy", "Arrays"],
    mcq_count: 2,
    coding_count: 2,
    duration_minutes: 80,
    difficulty: "hard",
    description: "Algo-heavy, real-time systems",
  },
];
