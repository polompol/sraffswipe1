export type EmployerFeedState = "ready" | "loading" | "error" | "needs_vacancy";

export function employerFeedState(
  isSeeker: boolean,
  vacancies: readonly unknown[] | undefined,
  isLoading: boolean,
  isError: boolean,
): EmployerFeedState {
  if (isSeeker) return "ready";
  if (isError) return "error";
  if (isLoading || vacancies === undefined) return "loading";
  return vacancies.length > 0 ? "ready" : "needs_vacancy";
}
