export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export type WhiteboardTool = 'pen' | 'eraser';

export interface Stroke {
  id: string;
  tool: WhiteboardTool;
  color: string;
  width: number;
  opacity: number;
  points: Point[];
}

export type WhiteboardTheme = 'plain' | 'grid' | 'chalkboard' | 'dark';

export interface WhiteboardPage {
  id: string;
  strokes: Stroke[];
  undoStack: Stroke[][];
  redoStack: Stroke[][];
  createdAt: number;
}

export interface UserProfile {
  name: string;
  className: string;
  studentId?: string;
  studyHours: number;
  totalExperimentsRun: number;
}

export type TeacherProfile = UserProfile;

export interface WhiteboardOptions {
  initialTheme?: WhiteboardTheme;
  defaultColor?: string;
  defaultWidth?: number;
  onPageChange?: (pageIndex: number, totalPages: number) => void;
  onToolChange?: (tool: WhiteboardTool) => void;
  onColorChange?: (color: string) => void;
  onWidthChange?: (width: number) => void;
}
