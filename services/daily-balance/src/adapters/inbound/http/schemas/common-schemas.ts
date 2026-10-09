import { Type } from 'typebox';

export const ProblemSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer(),
    detail: Type.String(),
    code: Type.String(),
  },
  { $id: 'Problem' },
);

export const problemResponses = {
  400: Type.Ref('Problem'),
  401: Type.Ref('Problem'),
  403: Type.Ref('Problem'),
  429: Type.Ref('Problem'),
  500: Type.Ref('Problem'),
  503: Type.Ref('Problem'),
};
