import { data, type ActionFunctionArgs } from "react-router";
import { prisma } from "~/prisma.server";
import { getFormValues, validate, hasErrors } from "./shared";
import { ensureUser } from "~/users/functions.server";
import { createId } from "@paralleldrive/cuid2";

export async function action({ request }: ActionFunctionArgs) {
  const user = await ensureUser(request);

  const values = await getFormValues(request);
  const errors = validate(values);
  if (hasErrors(errors)) {
    return data({ success: false, errors }, { status: 400 });
  }

  await prisma.accountBook.create({
    data: {
      id: createId(),
      name: "New Account Book",
      referenceCurrency: values.referenceCurrency,
      groups: {
        create: [
          { name: "Assets", type: "ASSET" },
          { name: "Liabilities", type: "LIABILITY" },
          { name: "Equity", type: "EQUITY" },
        ],
      },
      userLinks: {
        create: { userId: user.id },
      },
    },
  });

  return { success: true };
}
