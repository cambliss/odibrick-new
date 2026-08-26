import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RoleCode } from '../../common/auth/auth.types';

export class RegisterDto {
  @IsString() @MaxLength(160)
  fullName!: string;

  @IsEmail({}, { message: 'Enter a valid email address.' }) @MaxLength(190)
  email!: string;

  @IsOptional() @Matches(/^[0-9]{10}$|^\+[0-9]{11,14}$/, { message: 'Enter a 10-digit mobile number.' })
  phone?: string;

  @IsString()
  @MinLength(10, { message: 'Use at least 10 characters.' })
  @MaxLength(128)
  @Matches(/[A-Za-z]/, { message: 'Include at least one letter.' })
  @Matches(/[0-9]/, { message: 'Include at least one number.' })
  password!: string;

  @IsIn(['TENANT', 'OWNER', 'AGENT', 'BUILDER'], { message: 'Choose how you will use Odibrick.' })
  role!: RoleCode;

  @IsOptional() @IsString() @MaxLength(190)
  organisationName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  city?: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}

export class RefreshDto {
  @IsOptional() @IsString() refreshToken?: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(10) @MaxLength(128) newPassword!: string;
}
