---
name: react-ui-signup-errors
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Make the signup form in my React app show errors properly. Right now it just turns the input border
red and clears the fields when something is wrong. Here is the whole component, there are no other
files:

```jsx
export function Signup({ onSubmit }) {
  const [email, setEmail] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(email) || (setBad(true), setEmail("")); }}>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
        style={{ borderColor: bad ? "red" : "gray" }} />
      <button>Sign up</button>
    </form>
  );
}
```
