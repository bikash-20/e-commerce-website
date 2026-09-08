import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware() {
    // any extra checks go here
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  },
);

export const config = {
  matcher: ["/dashboard/:path*", "/checkout/:path*", "/account/:path*"],
};
