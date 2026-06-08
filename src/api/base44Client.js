// Stub — Base44 SDK removed. All data fetching now uses direct fetch calls.
export const base44 = {
  functions: { invoke: () => Promise.reject(new Error("base44 removed")) },
  entities:  { WreckReview: { filter: () => Promise.resolve([]) } },
  auth:      { me: () => Promise.reject(new Error("base44 removed")), logout: () => {}, redirectToLogin: () => {} },
};
