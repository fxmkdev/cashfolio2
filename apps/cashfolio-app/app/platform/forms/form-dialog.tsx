import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useFetcher } from "react-router";
import { Button, Input, Modal, type ModalBaseProps } from "@mantine/core";

export type FetcherData =
  | { success: true; errors: never }
  | { success: false; errors: { form?: string } & Record<string, string> };
export type FormKey = "new" | `edit-${string}`;

export type FormDialogContextType = {
  entityId?: string;
  fetcher: ReturnType<typeof useFetcher<FetcherData>>;
  onDialogClose: (action: FormCloseAction) => void;
};

const FormDialogContext = createContext<FormDialogContextType | null>(null);

type FormCloseAction = "submit" | "cancel";

export function FormDialog({
  children,
  entityId,
  onClose,
  action,
  opened,
  title,
  size,
}: {
  size?: ModalBaseProps["size"];
  opened: boolean;
  title: ReactNode;
  entityId?: string;
  onClose: (action: FormCloseAction) => void;
  action?: string;
  children?: ReactNode | ((context: FormDialogContextType) => ReactNode);
}) {
  const [submitCount, setSubmitCount] = useState(0);
  const fetcher = useFetcher<FetcherData>({
    key: `${entityId ?? "new"}-${submitCount}`,
  });

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      onDialogClose("submit");
    }
  }, [fetcher.state, fetcher.data?.success, onDialogClose]);

  function onDialogClose(action: FormCloseAction) {
    onClose(action);
    // delay a bit for the dialog close animation
    setTimeout(() => setSubmitCount((v) => v + 1), 500);
  }

  const contextValue: FormDialogContextType = {
    onDialogClose,
    fetcher,
    entityId,
  };
  return (
    <Modal
      opened={opened}
      onClose={() => onDialogClose("cancel")}
      title={title}
      size={size}
    >
      <fetcher.Form className="contents" action={action} method="POST">
        <FormDialogContext.Provider value={contextValue}>
          {typeof children === "function" ? children(contextValue) : children}
        </FormDialogContext.Provider>
      </fetcher.Form>
    </Modal>
  );
}

type CancelButtonProps = Omit<
  ComponentProps<typeof Button>,
  "variant" | "children" | "onClick"
>;

export function CancelButton(props: CancelButtonProps) {
  const { onDialogClose } = useFormDialogContext();
  return (
    <Button
      {...(props as CancelButtonProps)}
      variant="default"
      onClick={() => onDialogClose("cancel")}
    >
      Cancel
    </Button>
  );
}

export function CreateOrSaveButton() {
  const { entityId, fetcher } = useFormDialogContext();
  return (
    <Button
      type="submit"
      variant="filled"
      disabled={fetcher.state !== "idle" || fetcher.data?.success}
    >
      {entityId
        ? fetcher.state === "idle"
          ? "Save"
          : "Saving…"
        : fetcher.state === "idle"
          ? "Create"
          : "Creating…"}
    </Button>
  );
}

export function DeleteButton() {
  const { fetcher } = useFormDialogContext();
  return (
    <Button
      type="submit"
      color="red"
      disabled={fetcher.state !== "idle" || fetcher.data?.success}
    >
      {fetcher.state === "idle" ? "Delete" : "Deleting…"}
    </Button>
  );
}

export function FormErrorMessage() {
  const { fetcher } = useFormDialogContext();
  if (!fetcher.data?.errors?.form) return null;
  return <Input.Error>{fetcher.data.errors.form}</Input.Error>;
}

export function useFormDialogContext() {
  const context = useContext(FormDialogContext);
  if (!context) {
    throw new Error("useFormDialogContext must be used within a FormDialog");
  }
  return context;
}
