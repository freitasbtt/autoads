import Login from "../../pages/Login";

export default function LoginExample() {
  return <Login onLogin={() => console.log("Login successful")} />;
}
