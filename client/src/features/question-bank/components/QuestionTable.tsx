import React from 'react';
import { Link } from 'react-router-dom';
import { Code2, ArrowRight, Trash2, Building2, Database } from 'lucide-react';
import {
  Button,
  Badge,
  DifficultyBadge,
  Skeleton,
  EmptyState,
  TableContainer,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '../../../shared/components/ui';

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
  onDeleteQuestion,
}) => {
  return (
    <TableContainer>
      <Table>
        <THead>
          <tr>
            <TH>Title & Tags</TH>
            <TH className="hidden md:table-cell">Topic</TH>
            <TH>Difficulty</TH>
            <TH className="hidden lg:table-cell">Limits</TH>
            <TH className="text-right">Action</TH>
          </tr>
        </THead>
        <TBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TR key={i}>
                <TD>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </TD>
                <TD className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TD>
                <TD><Skeleton className="h-5 w-16 rounded-full" /></TD>
                <TD className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TD>
                <TD className="text-right"><Skeleton className="ml-auto h-8 w-20 rounded-lg" /></TD>
              </TR>
            ))
          ) : questions.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-0">
                <EmptyState
                  className="rounded-none border-0 bg-transparent"
                  icon={<Database />}
                  title="No questions found"
                  description="No problems match your current filters. Try clearing the search or difficulty filter."
                />
              </td>
            </tr>
          ) : (
            questions.map((q: any) => (
              <TR key={q.id} interactive>
                <TD className="text-on-surface">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <Code2 className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 space-y-1.5">
                      <p className="font-semibold text-on-surface">{q.title}</p>
                      <div className="flex flex-wrap gap-1">
                        {q.questionTags?.map((map: any, index: number) => (
                          <Badge key={map.tag?.id || map.tagId || index} variant="default" className="px-1.5 py-0 font-mono text-[10px]">
                            #{map.tag?.name}
                          </Badge>
                        ))}
                        {q.companyTags?.map((map: any, index: number) => (
                          <Badge key={map.companyTag?.id || map.companyTagId || index} variant="accent" className="px-1.5 py-0 font-mono text-[10px]">
                            <Building2 className="h-2.5 w-2.5" /> {map.companyTag?.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </TD>

                <TD className="hidden md:table-cell font-medium">{q.topic?.name || '—'}</TD>

                <TD>
                  <DifficultyBadge difficulty={q.difficulty} />
                </TD>

                <TD className="hidden lg:table-cell font-mono text-xs">
                  {q.timeLimitMs || 2000}ms · {q.memoryLimitMb || 256}MB
                </TD>

                <TD className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link to={`/questions/${q.id}`}>
                      <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                        Solve
                      </Button>
                    </Link>
                    {isAdmin && onDeleteQuestion && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete question"
                        title="Delete question"
                        className="text-on-surface-muted hover:bg-error-container hover:text-danger"
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete this question?')) {
                            onDeleteQuestion(q.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
