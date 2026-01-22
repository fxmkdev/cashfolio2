import { useSearchParams } from "react-router";
import { Switch } from "@mantine/core";

export function ShowInactiveSwitch() {
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <Switch
      name="showInactive"
      onChange={(e) => {
        setSearchParams((params) => {
          if (e.currentTarget.checked) {
            params.set("showInactive", "true");
          } else {
            params.delete("showInactive");
          }
          return params;
        });
      }}
      checked={searchParams.get("showInactive") === "true"}
      color="red"
      label="Show Inactive"
    />
  );
}
