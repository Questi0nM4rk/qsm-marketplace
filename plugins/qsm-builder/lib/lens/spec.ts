// What one edit on the served page is made of: the fields it turns into, and where it goes. The
// pen script reads a Spec as JSON; the page builds it; a new item uses the same shape.

export interface Field {
  readonly name: string;
  readonly label: string;
  /** `long` is a tall text box for a whole file */
  readonly control: "input" | "select" | "textarea" | "long";
  readonly value: string;
  readonly options?: readonly string[];
  /** one line under the control: why this can be edited */
  readonly hint?: string;
  /** a new item cannot be saved with this one empty */
  readonly required?: boolean;
}

/** One edit: where it goes, which file and section, and the control that changes it. */
export interface Spec {
  /** `new`: the form of a skill, agent or plugin that does not exist yet */
  readonly kind?: "new";
  /** the plugin, or `<plugin>:<item>` */
  readonly where: string;
  /** relative to the marketplace root; for a new item a template, `{name}` filled from that field */
  readonly file: string;
  readonly section: string;
  readonly what: string;
  readonly fields: readonly Field[];
  /** for an edit with no field (a removal): the text before and after */
  readonly before?: string;
  readonly after?: string;
  /** a new item: the field whose value ends the task title, and a template for `where` */
  readonly titleField?: string;
  readonly whereFrom?: string;
  /** offer "Check whether this already exists" beside save */
  readonly check?: boolean;
}
