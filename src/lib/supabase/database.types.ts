// Generated from the live schema. Regenerate after any migration with the
// Supabase MCP `generate_typescript_types` tool, or:
//   npx supabase gen types typescript --project-id sljoxjswtrwwsqomnopc
//
// The Database type above is verbatim generator output. The three helper
// aliases at the bottom are hand-trimmed: the generated versions carry
// cross-schema lookup generics we never use, and they made every call site
// unreadable. Re-trim them after a regenerate.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      agent_traces: {
        Row: {
          agent: string
          created_at: string
          exam_id: string
          id: number
          payload: Json
          turn: number
        }
        Insert: {
          agent: string
          created_at?: string
          exam_id: string
          id?: never
          payload: Json
          turn: number
        }
        Update: {
          agent?: string
          created_at?: string
          exam_id?: string
          id?: never
          payload?: Json
          turn?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_traces_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          confidence: number | null
          created_at: string
          exam_id: string
          id: string
          label_written: string | null
          question_id: string | null
          regions: Json
          status: string
          transcript: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          exam_id: string
          id?: string
          label_written?: string | null
          question_id?: string | null
          regions?: Json
          status?: string
          transcript?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          exam_id?: string
          id?: string
          label_written?: string | null
          question_id?: string | null
          regions?: Json
          status?: string
          transcript?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          answer_sheet: Json
          created_at: string
          error: string | null
          id: string
          progress: number
          question_paper: Json
          stage: string
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          answer_sheet: Json
          created_at?: string
          error?: string | null
          id?: string
          progress?: number
          question_paper: Json
          stage?: string
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          answer_sheet?: Json
          created_at?: string
          error?: string | null
          id?: string
          progress?: number
          question_paper?: Json
          stage?: string
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      gradings: {
        Row: {
          created_at: string
          exam_id: string
          feedback: string | null
          id: string
          marks_awarded: number
          max_marks: number
          question_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          feedback?: string | null
          id?: string
          marks_awarded?: number
          max_marks?: number
          question_id: string
          verdict: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          feedback?: string | null
          id?: string
          marks_awarded?: number
          max_marks?: number
          question_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "gradings_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          box2d: Json | null
          created_at: string
          exam_id: string
          id: string
          max_marks: number | null
          number: string
          order_index: number
          page_index: number | null
          parent_number: string
          part_label: string | null
          text: string
        }
        Insert: {
          box2d?: Json | null
          created_at?: string
          exam_id: string
          id?: string
          max_marks?: number | null
          number: string
          order_index: number
          page_index?: number | null
          parent_number: string
          part_label?: string | null
          text: string
        }
        Update: {
          box2d?: Json | null
          created_at?: string
          exam_id?: string
          id?: string
          max_marks?: number | null
          number?: string
          order_index?: number
          page_index?: number | null
          parent_number?: string
          part_label?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]
