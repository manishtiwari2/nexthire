import React from 'react';
import { Link } from 'react-router-dom';
import { Code2, ArrowRight, Trash2, Tag as TagIcon, Building2 } from 'lucide-react';
import { Button } from '../../../shared/components/ui/Button';

interface QuestionTableProps {
  questions: any[];
  isLoading: boolean;
  isAdmin: boolean;
  onDeleteQuestion?: (id: string) => void;
}

export const QuestionTable: React.FC<QuestionTableProps> = ({
  questions,
  isLoading,
  isAdmin,
  onDeleteQuestion
}) => {
  return (
    <div className="bg-white rounded-3xl border border-outline-variant overflow-hidden shadow-sm">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface font-bold uppercase tracking-wider">
            <th className="p-4">Title & Tags</th>
            <th className="p-4">Topic</th>
            <th className="p-4">Difficulty</th>
            <th className="p-4">Limits</th>
            <th className="p-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/50">
          {isLoading ? (
            <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading question bank...</td></tr>
          ) : questions.length === 0 ? (
            <tr><td colSpan={5} className="p-0">
              <div className="text-center py-12 text-sm text-slate-500">
                <p>No questions found matching your filters.</p>
              </div>
            </td></tr>
          ) : (
            questions.map((q: any) => (
              <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 space-y-1">
                  <div className="font-bold text-on-surface flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-primary" />
                    <span>{q.title}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {q.questionTags?.map((map: any, index: number) => (
                      <span key={map.tag?.id || map.tagId || index} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                        #{map.tag?.name}
                      </span>
                    ))}
                    {q.companyTags?.map((map: any, index: number) => (
                      <span key={map.companyTag?.id || map.companyTagId || index} className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded font-mono flex items-center gap-0.5">
                        <Building2 className="w-2.5 h-2.5" /> {map.companyTag?.name}
                      </span>
                    ))}
                  </div>
                </td>

                <td className="p-4 text-on-surface-variant font-medium">
                  {q.topic?.name || 'Algorithms'}
                </td>

                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    q.difficulty === 'EASY' ? 'bg-emerald-100 text-emerald-800' :
                    q.difficulty === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {q.difficulty}
                  </span>
                </td>

                <td className="p-4 text-on-surface-variant font-mono text-[11px]">
                  {q.timeLimitMs || 2000}ms / {q.memoryLimitMb || 256}MB
                </td>

                <td className="p-4 text-right space-x-2">
                  <Link
                    to={`/questions/${q.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:bg-blue-700 transition-all"
                  >
                    Solve <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  {isAdmin && onDeleteQuestion && (
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this question?')) {
                          onDeleteQuestion(q.id);
                        }
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Question (Admin Only)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
