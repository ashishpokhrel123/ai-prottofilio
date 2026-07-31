import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "admin@example.com" })
  @IsEmail({}, { message: "A valid email address is required." })
  // Normalise here so the lookup is case-insensitive without a functional index.
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 200 })
  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters." })
  // Argon2 hashes the whole input; an unbounded field is a cheap DoS vector.
  @MaxLength(200)
  password!: string;
}
